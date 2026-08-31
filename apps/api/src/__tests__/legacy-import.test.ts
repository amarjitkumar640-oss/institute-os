import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import { importLegacyStudent, DuplicateLegacyIdError } from "../modules/students/legacy-import.service";
import { BatchFullError } from "../modules/enrollments/enrollments.service";
import type { LegacyStudentInput } from "@institute-os/shared";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const CENTER_ID = "22222222-2222-2222-2222-222222222222";

async function makeTenantCenterBatch(capacity = 10) {
  await prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute", slug: "test-institute" },
  });
  await prisma.center.upsert({
    where:  { id: CENTER_ID },
    update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: "Foundation", durationMonths: 6, defaultFee: 12000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID,
      courseId: course.id,
      centerId: CENTER_ID,
      name: "Foundation-A",
      capacity,
      startDate: new Date(),
      endDate:   new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
    },
  });
}

function baseInput(overrides: Partial<LegacyStudentInput> = {}): LegacyStudentInput {
  return {
    legacyId:   "5549",
    fullName:   "Sampa Soren",
    fatherName: "Dhanu Soren",
    address:    "At - Dhilabera, P.O - Katashol, P.S - Baghsol, Dist - East Singhbhum",
    qualification: "graduation",
    passYear:   "2020",
    board:      "KU",
    email:      "sampasoren0@gmail.com",
    aadhaar:    "642449905984",
    phone:      "7857804436",
    guardianPhone: "9608509650",
    totalFee:   12000,
    payments: [
      { date: "2025-08-12", amount: 7000, receiptNo: "3300" },
      { date: "2026-05-11", amount: 1000, receiptNo: "3957" },
      { date: "2026-07-13", amount: 1000, receiptNo: "4125" },
    ],
    ...overrides,
  };
}

describe("importLegacyStudent", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates the student, enrolls them, and builds a fee schedule with a pending balance", async () => {
    const batch = await makeTenantCenterBatch();

    const student = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID,
        centerId: CENTER_ID,
        batchId:  batch.id,
        defaultCourseId: batch.courseId,
        staffId:  null,
        input:    baseInput(),
      })
    );

    expect(student.legacyId).toBe("5549");
    expect(student.fatherName).toBe("Dhanu Soren");

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { studentId_batchId: { studentId: student.id, batchId: batch.id } },
      include: { feeSchedule: { include: { installments: { orderBy: { sortOrder: "asc" } }, transactions: true } } },
    });
    expect(enrollment.status).toBe("active");

    const schedule = enrollment.feeSchedule!;
    expect(Number(schedule.totalFee)).toBe(12000);
    expect(schedule.status).toBe("active"); // not fully paid: 7000+1000+1000 = 9000 < 12000

    expect(schedule.installments).toHaveLength(4); // 3 payments + 1 balance-due
    const paidInstallments = schedule.installments.filter((i) => i.status === "paid");
    expect(paidInstallments).toHaveLength(3);
    const balanceDue = schedule.installments.find((i) => i.label === "Balance Due")!;
    expect(Number(balanceDue.plannedAmount)).toBe(3000);
    expect(balanceDue.status).toBe("pending");

    expect(schedule.transactions).toHaveLength(3);
    // receiptNo is always our own auto-generated one — the register's own
    // number is preserved separately as legacyReceiptNo, purely for
    // reference, and isn't required to be unique.
    schedule.transactions.forEach((t) => {
      expect(t.receiptNo).toMatch(/^RCP-/);
      expect(t.mode).toBe("cash");
    });
    const legacyReceiptNos = schedule.transactions.map((t) => t.legacyReceiptNo).sort();
    expect(legacyReceiptNos).toEqual(["3300", "3957", "4125"]);

    // Historical dates preserved, not "today".
    const firstTxn = schedule.transactions.find((t) => t.legacyReceiptNo === "3300")!;
    expect(firstTxn.paidAt.toISOString().slice(0, 10)).toBe("2025-08-12");
  });

  it("defaults courseId to the batch's own course, but a per-student courseId overrides it", async () => {
    const batch = await makeTenantCenterBatch();
    const otherCourse = await prisma.course.create({
      data: { tenantId: TENANT_ID, name: "Banking Foundation", durationMonths: 6, defaultFee: 15000 },
    });

    const defaulted = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549" }),
      })
    );
    expect(defaulted.courseId).toBe(batch.courseId);

    const overridden = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({
          legacyId: "5550", fullName: "Krishna Manki", phone: "8340315391", courseId: otherCourse.id,
          payments: [{ date: "2025-08-21", amount: 6000, receiptNo: "3924" }],
        }),
      })
    );
    expect(overridden.courseId).toBe(otherCourse.id);
  });

  it("marks the schedule completed with no balance-due row when fully paid", async () => {
    const batch = await makeTenantCenterBatch();

    const student = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID,
        centerId: CENTER_ID,
        batchId:  batch.id,
        defaultCourseId: batch.courseId,
        staffId:  null,
        input: baseInput({
          totalFee: 9000,
          payments: [
            { date: "2025-08-12", amount: 7000, receiptNo: "3300" },
            { date: "2026-05-11", amount: 2000, receiptNo: "3957" },
          ],
        }),
      })
    );

    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: student.id },
      include: { feeSchedule: { include: { installments: true } } },
    });
    expect(enrollment.feeSchedule!.status).toBe("completed");
    expect(enrollment.feeSchedule!.installments).toHaveLength(2); // no balance-due row
  });

  it("throws BatchFullError when the batch is already at capacity", async () => {
    const batch = await makeTenantCenterBatch(1);
    await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549" }),
      })
    );

    await expect(
      prisma.$transaction((tx) =>
        importLegacyStudent(tx, {
          tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
          input: baseInput({ legacyId: "5550", fullName: "Krishna Manki", phone: "8340315391" }),
        })
      )
    ).rejects.toBeInstanceOf(BatchFullError);
  });

  it("lets two different students reuse the same register receipt number without colliding", async () => {
    const batch = await makeTenantCenterBatch();
    await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549", payments: [{ date: "2025-08-12", amount: 7000, receiptNo: "3300" }] }),
      })
    );

    // A second, different student whose register also happened to show
    // "3300" (a different physical receipt book, or just a coincidence) —
    // this must NOT fail, since receiptNo itself is always auto-generated
    // and legacyReceiptNo carries no uniqueness constraint.
    const second = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5550", fullName: "Krishna Manki", phone: "8340315391", payments: [{ date: "2025-08-21", amount: 6000, receiptNo: "3300" }] }),
      })
    );

    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: second.id },
      include: { feeSchedule: { include: { transactions: true } } },
    });
    expect(enrollment.feeSchedule!.transactions[0].legacyReceiptNo).toBe("3300");
  });

  it("auto-generates a label and skips legacyReceiptNo when a payment has no register receipt number", async () => {
    const batch = await makeTenantCenterBatch();
    const student = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ payments: [{ date: "2025-08-12", amount: 7000 }] }),
      })
    );

    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: student.id },
      include: { feeSchedule: { include: { installments: true, transactions: true } } },
    });
    expect(enrollment.feeSchedule!.transactions[0].legacyReceiptNo).toBeNull();
    expect(enrollment.feeSchedule!.installments.find((i) => i.status === "paid")!.label).toBe("Payment 1");
  });

  it("throws DuplicateLegacyIdError when a legacyId already exists for this tenant", async () => {
    const batch = await makeTenantCenterBatch();
    await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549" }),
      })
    );

    await expect(
      prisma.$transaction((tx) =>
        importLegacyStudent(tx, {
          tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
          // Same legacyId, otherwise a completely different person — the
          // collision is what matters, not any other field matching.
          input: baseInput({ legacyId: "5549", fullName: "Krishna Manki", phone: "8340315391" }),
        })
      )
    ).rejects.toBeInstanceOf(DuplicateLegacyIdError);
  });

  it("does not treat two different tenants' students with the same legacyId as a collision", async () => {
    const batch = await makeTenantCenterBatch();
    const otherTenantId = "33333333-3333-3333-3333-333333333333";
    await prisma.tenant.upsert({
      where: { id: otherTenantId },
      update: {},
      create: { id: otherTenantId, name: "Other Institute", slug: "other-institute-legacy-import" },
    });
    const otherCenterId = "44444444-4444-4444-4444-444444444444";
    const otherCenter = await prisma.center.upsert({
      where:  { id: otherCenterId },
      update: {},
      create: { id: otherCenterId, tenantId: otherTenantId, name: "Other Center", address: "Elsewhere" },
    });
    const otherCourse = await prisma.course.create({
      data: { tenantId: otherTenantId, name: "Foundation", durationMonths: 6, defaultFee: 12000 },
    });
    const otherBatch = await prisma.batch.create({
      data: {
        tenantId: otherTenantId, courseId: otherCourse.id, centerId: otherCenter.id, name: "Foundation-A",
        capacity: 10, startDate: new Date(), endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
      },
    });

    await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549" }),
      })
    );

    // Same legacyId, but a different tenant's own paper register — must not collide.
    const student = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: otherTenantId, centerId: otherCenter.id, batchId: otherBatch.id, defaultCourseId: otherBatch.courseId, staffId: null,
        input: baseInput({ legacyId: "5549", fullName: "Krishna Manki", phone: "8340315391" }),
      })
    );
    expect(student.legacyId).toBe("5549");
  });

  it("defaults totalFee to the resolved course's own fee, not the sum of payments, when omitted", async () => {
    const batch = await makeTenantCenterBatch(); // course defaultFee: 12000
    const student = await prisma.$transaction((tx) =>
      importLegacyStudent(tx, {
        tenantId: TENANT_ID, centerId: CENTER_ID, batchId: batch.id, defaultCourseId: batch.courseId, staffId: null,
        input: baseInput({ totalFee: undefined, payments: [{ date: "2025-08-12", amount: 7000, receiptNo: "3300" }] }),
      })
    );

    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: student.id },
      include: { feeSchedule: true },
    });
    // 12000 (course fee), not 7000 (sum of payments).
    expect(Number(enrollment.feeSchedule!.totalFee)).toBe(12000);
  });
});

describe("POST /api/students/bulk-import-legacy", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  async function makeAdmin() {
    const passwordHash = await bcrypt.hash("secret123", 10);
    return prisma.staff.create({
      data: {
        tenantId: TENANT_ID, fullName: "Admin User", phone: "9999999999",
        email: "admin@x.test", roles: ["admin"], passwordHash,
      },
    });
  }

  function tokenFor(payload: AuthPayload) {
    const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
    return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  }

  // One good student + one missing `phone` — the whole request must not
  // 400: the good one imports, and the bad one comes back in `results`
  // with a specific, readable reason instead of taking down the batch.
  it("imports the valid students and reports a specific per-row error for an invalid one, without a blanket 400", async () => {
    const batch = await makeTenantCenterBatch();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/bulk-import-legacy")
      .set("Authorization", `Bearer ${token}`)
      .send({
        batchId: batch.id,
        students: [
          baseInput({ legacyId: "5549" }),
          { ...baseInput({ legacyId: "5550", fullName: "Krishna Manki" }), phone: undefined },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.results[1].success).toBe(false);
    expect(res.body.results[1].error).toMatch(/phone/i);
  });

  // Two rows in the same payload sharing a legacyId — a copy/paste error, or
  // a paper-register range that overlaps a previous import — must not both
  // succeed: the first commits, the second is reported as a specific
  // per-row failure rather than creating a silent duplicate.
  it("reports a per-row duplicate error when two rows in the same payload share a legacyId", async () => {
    const batch = await makeTenantCenterBatch();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/bulk-import-legacy")
      .set("Authorization", `Bearer ${token}`)
      .send({
        batchId: batch.id,
        students: [
          baseInput({ legacyId: "5549" }),
          baseInput({ legacyId: "5549", fullName: "Krishna Manki", phone: "8340315391" }),
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.results[1].success).toBe(false);
    expect(res.body.results[1].error).toMatch(/legacy id 5549 already exists/i);

    expect(await prisma.student.count({ where: { tenantId: TENANT_ID, legacyId: "5549" } })).toBe(1);
  });

  it("rejects a row with a missing legacyId instead of importing it", async () => {
    const batch = await makeTenantCenterBatch();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/bulk-import-legacy")
      .set("Authorization", `Bearer ${token}`)
      .send({ batchId: batch.id, students: [{ ...baseInput(), legacyId: undefined }] });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toMatch(/legacyId/i);
  });

  it("still 400s on a structurally malformed request (students not an array)", async () => {
    const batch = await makeTenantCenterBatch();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/bulk-import-legacy")
      .set("Authorization", `Bearer ${token}`)
      .send({ batchId: batch.id, students: "not-an-array" });

    expect(res.status).toBe(400);
  });

  // An AI-extraction pipeline transcribing straight from register photos is
  // just as likely to use PaymentTransaction's own column name (paidAt) as
  // the "date" this schema documents — a payment shouldn't be rejected just
  // because of which one it picked.
  it("accepts a payment's date under the key \"paidAt\" as well as \"date\"", async () => {
    const batch = await makeTenantCenterBatch();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app)
      .post("/api/students/bulk-import-legacy")
      .set("Authorization", `Bearer ${token}`)
      .send({
        batchId: batch.id,
        students: [
          {
            ...baseInput({ legacyId: "5549" }),
            payments: [{ paidAt: "2025-08-12", amount: 7000, receiptNo: "3300" }],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
  });
});
