import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

// Covers the one behavior change made to the admission flow for the
// course-level standing discount feature: students.routes.ts's "/admit"
// route now reads Course.discountAmount (instead of hardcoding 0) when
// generating a new student's fee schedule.

const TENANT_ID = "77777777-7777-7777-7777-777777777777";
const CENTER_ID = "88888888-8888-8888-8888-888888888888";

async function makeTenantCenter() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: {},
    create: { id: TENANT_ID, name: "Admission Discount Test Institute", slug: "admission-discount-test" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_ID }, update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
}

// A course with a standing discount and a single "remaining" fee-template
// line, so generateSchedule takes the branch that actually reads
// discountAmount (a course with no template lines falls into a separate
// admission-payment-only branch that this feature doesn't touch).
async function makeDiscountedCourseBatch(discountAmount: number) {
  const course = await prisma.course.create({
    data: {
      tenantId: TENANT_ID, name: `Discounted Course ${Date.now()}`,
      durationMonths: 6, defaultFee: 12000, discountAmount,
      feeTemplate: {
        create: {
          lines: { create: [{ sortOrder: 0, label: "Course Fee", lineType: "remaining", trigger: "on_admission" }] },
        },
      },
    },
  });
  const batch = await prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, centerId: CENTER_ID, name: "Discount Batch",
      capacity: 50, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    },
  });
  return { course, batch };
}

async function makeAdmin() {
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Admin User", phone: "9999999997", email: "admission-discount-admin@x.test", roles: ["admin"], passwordHash },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

async function adminToken() {
  const staff = await makeAdmin();
  return tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });
}

// dob/address/aadhaar/gender are required on admitStudentSchema — every
// admit request in this file needs them, regardless of what it's testing.
const REQUIRED_PERSONAL_FIELDS = { dob: "2000-01-01", address: "123 Main St", aadhaar: "123456789012", gender: "male" };

describe("POST /api/students/admit — course standing discount", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("applies the course's discountAmount to the generated fee schedule automatically", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(1000);
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...REQUIRED_PERSONAL_FIELDS, fullName: "Discount Test Student", phone: "9000000001", batchId: batch.id });

    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({
      where: { enrollment: { studentId: res.body.student.id } },
    });
    expect(schedule).not.toBeNull();
    expect(Number(schedule!.totalFee)).toBe(12000);
    expect(Number(schedule!.discountAmount)).toBe(1000);
    expect(Number(schedule!.effectiveFee)).toBe(11000);
  });

  it("marks the schedule completed when the amount paid covers the discounted total, not the undiscounted one", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(1000);
    const token = await adminToken();

    // Course fee is 12000, discounted to 11000 — paying exactly 11000
    // should fully settle the schedule even though it's short of 12000.
    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...REQUIRED_PERSONAL_FIELDS,
        fullName: "Fully Paid Discount Student", phone: "9000000002", batchId: batch.id,
        amountPaid: 11000, paymentMode: "cash",
      });

    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({
      where: { enrollment: { studentId: res.body.student.id } },
    });
    expect(schedule!.status).toBe("completed");
  });

  it("defaults to no discount for a course with discountAmount left at 0", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(0);
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...REQUIRED_PERSONAL_FIELDS, fullName: "No Discount Student", phone: "9000000003", batchId: batch.id });

    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({
      where: { enrollment: { studentId: res.body.student.id } },
    });
    expect(Number(schedule!.effectiveFee)).toBe(12000);
  });
});

describe("POST /api/students/admit — manual per-student discount override", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("uses the manually-entered discount instead of the course's standing discount", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(500); // course standing discount = 500
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...REQUIRED_PERSONAL_FIELDS,
        fullName: "Manual Discount Student", phone: "9000000011", batchId: batch.id,
        discountAmount: 2000, discountReason: "Special case — hardship discount",
      });

    expect(res.status).toBe(201);
    const schedule = await prisma.studentFeeSchedule.findFirst({
      where: { enrollment: { studentId: res.body.student.id } },
    });
    expect(Number(schedule!.discountAmount)).toBe(2000); // not the course's 500
    expect(Number(schedule!.effectiveFee)).toBe(10000);
    expect(schedule!.discountReason).toBe("Special case — hardship discount");
  });

  it("rejects a manual discount that exceeds the course fee", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(0);
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...REQUIRED_PERSONAL_FIELDS, fullName: "Over Discount Student", phone: "9000000012", batchId: batch.id, discountAmount: 20000 });

    expect(res.status).toBe(422);
  });

  it("allows explicitly overriding a course discount down to zero", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(1000);
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...REQUIRED_PERSONAL_FIELDS, fullName: "Zero Override Student", phone: "9000000013", batchId: batch.id, discountAmount: 0 });

    expect(res.status).toBe(201);
    const schedule = await prisma.studentFeeSchedule.findFirst({
      where: { enrollment: { studentId: res.body.student.id } },
    });
    expect(Number(schedule!.discountAmount)).toBe(0);
    expect(Number(schedule!.effectiveFee)).toBe(12000);
  });
});

describe("POST /api/students/admit — mandatory personal fields", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it.each(["dob", "address", "aadhaar", "gender"])(
    "rejects an admission missing %s",
    async (field) => {
      await makeTenantCenter();
      const { batch } = await makeDiscountedCourseBatch(0);
      const token = await adminToken();

      const body: Record<string, unknown> = {
        ...REQUIRED_PERSONAL_FIELDS,
        fullName: "Missing Field Student", phone: "9000000099", batchId: batch.id,
      };
      delete body[field];

      const res = await request(app)
        .post("/api/students/admit")
        .set("Authorization", `Bearer ${token}`)
        .send(body);

      expect(res.status).toBe(400);
    },
  );

  it("admits successfully once all four fields are present", async () => {
    await makeTenantCenter();
    const { batch } = await makeDiscountedCourseBatch(0);
    const token = await adminToken();

    const res = await request(app)
      .post("/api/students/admit")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...REQUIRED_PERSONAL_FIELDS, fullName: "Complete Student", phone: "9000000098", batchId: batch.id });

    expect(res.status).toBe(201);
  });
});
