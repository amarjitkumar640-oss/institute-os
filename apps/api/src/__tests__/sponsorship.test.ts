import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import { generateInvoice } from "../modules/sponsors/invoice.service";
import { createSponsor, createContract, createMilestone } from "../modules/sponsors/sponsors.service";

const TENANT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CENTER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

async function makeTenantCenter(overrides: Record<string, unknown> = {}) {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: overrides,
    create: { id: TENANT_ID, name: "Sponsorship Test Institute", slug: "sponsorship-test", ...overrides },
  });
  await prisma.center.upsert({
    where: { id: CENTER_ID }, update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
}

async function makeCourseBatch(isFree = false) {
  const course = await prisma.course.create({
    data: {
      tenantId: TENANT_ID, name: `Sponsorship Course ${Date.now()}-${Math.random()}`,
      durationMonths: 6, defaultFee: 12000, isFree,
      feeTemplate: {
        create: {
          lines: { create: [{ sortOrder: 0, label: "Course Fee", lineType: "remaining", trigger: "on_admission" }] },
        },
      },
    },
  });
  const batch = await prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, centerId: CENTER_ID, name: "Sponsorship Batch",
      capacity: 50, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    },
  });
  return { course, batch };
}

async function makeAdmin() {
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Admin User", phone: `9${Math.floor(Math.random() * 1_000_000_000)}`, email: `sponsorship-admin-${Date.now()}@x.test`, roles: ["admin"], passwordHash },
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

async function admitStudent(token: string, batchId: string, phone: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/students/admit")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fullName: `Student ${phone}`, phone, batchId,
      dob: "2000-01-01", address: "123 Main St", aadhaar: "123456789012", gender: "male",
      ...extra,
    });
}

describe("Course.isFree — admission skips fee-schedule generation entirely", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates no StudentFeeSchedule for a student admitted into a free course", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(true);
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9200000001", { amountPaid: 5000, paymentMode: "cash" });
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(schedule).toBeNull();
    const payments = await prisma.paymentTransaction.findMany({ where: { tenantId: TENANT_ID } });
    expect(payments).toHaveLength(0);
  });

  it("still generates a normal schedule for a non-free course", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(false);
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9200000002");
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(schedule).not.toBeNull();
    expect(Number(schedule!.effectiveFee)).toBe(12000);
  });
});

describe("SponsorshipContract — admission skips fee-schedule generation for a sponsored batch", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates no StudentFeeSchedule for a student admitted into a sponsored batch", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(false); // course itself is NOT free
    const sponsor = await createSponsor(prisma, TENANT_ID, { name: "Acme Corp" });
    await createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 50, totalContractAmount: 100000,
      startDate: new Date("2026-01-01"),
    });
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9200000101", { amountPaid: 5000, paymentMode: "cash" });
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(schedule).toBeNull();
  });

  it("does not apply an inactive (cancelled) contract — student is billed normally", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(false);
    const sponsor = await createSponsor(prisma, TENANT_ID, { name: "Acme Corp" });
    const contract = await createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 50, totalContractAmount: 100000,
      startDate: new Date("2026-01-01"),
    });
    await prisma.sponsorshipContract.update({ where: { id: contract.id }, data: { status: "cancelled" } });
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9200000102");
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(schedule).not.toBeNull();
    expect(Number(schedule!.effectiveFee)).toBe(12000);
  });

  it("rejects creating a second contract for an already-sponsored batch", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(false);
    const sponsor = await createSponsor(prisma, TENANT_ID, { name: "Acme Corp" });
    await createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 50, totalContractAmount: 100000,
      startDate: new Date("2026-01-01"),
    });

    await expect(createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 10, totalContractAmount: 20000,
      startDate: new Date("2026-01-01"),
    })).rejects.toThrow("BATCH_ALREADY_SPONSORED");
  });
});

describe("Invoice generation — GST tax math", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  async function setup(gstRate: number | null, sponsorState: string | null, tenantState: string | null) {
    await makeTenantCenter({ stateCode: tenantState });
    const { batch } = await makeCourseBatch(false);
    const sponsor = await createSponsor(prisma, TENANT_ID, { name: "Acme Corp", stateCode: sponsorState ?? undefined });
    const contract = await createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 10, totalContractAmount: 100000,
      gstRate: gstRate ?? undefined, startDate: new Date("2026-01-01"),
    });
    const milestone = await createMilestone(prisma, contract.id, TENANT_ID, { label: "Advance", amount: 10000 });
    return milestone;
  }

  it("splits CGST+SGST when sponsor and institute share a state code", async () => {
    const milestone = await setup(18, "27", "27");
    const invoice = await generateInvoice(prisma, milestone.id, TENANT_ID);
    expect(Number(invoice.cgstAmount)).toBe(900);
    expect(Number(invoice.sgstAmount)).toBe(900);
    expect(Number(invoice.igstAmount)).toBe(0);
    expect(Number(invoice.totalAmount)).toBe(11800);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("applies IGST when sponsor and institute are in different states", async () => {
    const milestone = await setup(18, "27", "07");
    const invoice = await generateInvoice(prisma, milestone.id, TENANT_ID);
    expect(Number(invoice.cgstAmount)).toBe(0);
    expect(Number(invoice.sgstAmount)).toBe(0);
    expect(Number(invoice.igstAmount)).toBe(1800);
    expect(Number(invoice.totalAmount)).toBe(11800);
  });

  it("charges no tax at all when the contract is GST-exempt", async () => {
    const milestone = await setup(null, "27", "27");
    const invoice = await generateInvoice(prisma, milestone.id, TENANT_ID);
    expect(Number(invoice.cgstAmount)).toBe(0);
    expect(Number(invoice.sgstAmount)).toBe(0);
    expect(Number(invoice.igstAmount)).toBe(0);
    expect(Number(invoice.totalAmount)).toBe(10000);
    expect(invoice.gstRate).toBeNull();
  });

  it("allocates sequential invoice numbers and rejects a second invoice for the same milestone", async () => {
    await makeTenantCenter({ stateCode: "27" });
    const { batch } = await makeCourseBatch(false);
    const sponsor = await createSponsor(prisma, TENANT_ID, { name: "Acme Corp", stateCode: "27" });
    const contract = await createContract(prisma, TENANT_ID, {
      sponsorId: sponsor.id, batchId: batch.id,
      contractedStudentCount: 10, totalContractAmount: 100000,
      gstRate: 18, startDate: new Date("2026-01-01"),
    });
    const m1 = await createMilestone(prisma, contract.id, TENANT_ID, { label: "Advance", amount: 5000 });
    const m2 = await createMilestone(prisma, contract.id, TENANT_ID, { label: "Completion", amount: 5000 });

    const inv1 = await generateInvoice(prisma, m1.id, TENANT_ID);
    const inv2 = await generateInvoice(prisma, m2.id, TENANT_ID);
    expect(inv1.invoiceNumber).not.toBe(inv2.invoiceNumber);

    await expect(generateInvoice(prisma, m1.id, TENANT_ID)).rejects.toThrow("INVOICE_ALREADY_EXISTS");
  });
});
