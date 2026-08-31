import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import {
  createOffer, updateOffer, deleteOffer, listOffersForBatch,
} from "../modules/batches/offers.service";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CENTER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function makeTenantCenter() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: {},
    create: { id: TENANT_ID, name: "Batch Offer Test Institute", slug: "batch-offer-test" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_ID }, update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
}

// Course-level discount defaults to 0 unless passed, so tests can isolate
// "offer only" behavior vs. "offer falls back to course discount" behavior.
async function makeCourseBatch(courseDiscountAmount = 0) {
  const course = await prisma.course.create({
    data: {
      tenantId: TENANT_ID, name: `Offer Course ${Date.now()}-${Math.random()}`,
      durationMonths: 6, defaultFee: 12000, discountAmount: courseDiscountAmount,
      feeTemplate: {
        create: {
          lines: { create: [{ sortOrder: 0, label: "Course Fee", lineType: "remaining", trigger: "on_admission" }] },
        },
      },
    },
  });
  const batch = await prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, centerId: CENTER_ID, name: "Offer Batch",
      capacity: 50, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    },
  });
  return { course, batch };
}

async function makeAdmin() {
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Admin User", phone: `9${Math.floor(Math.random() * 1_000_000_000)}`, email: `offer-admin-${Date.now()}@x.test`, roles: ["admin"], passwordHash },
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

describe("offers.service — CRUD", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates, lists, updates, and deletes an offer", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch();

    const created = await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 3 });
    expect(Number(created.discountAmount)).toBe(500);
    expect(created.maxRedemptions).toBe(3);
    expect(created.redeemedCount).toBe(0);
    expect(created.isActive).toBe(true);

    const listed = await listOffersForBatch(prisma, batch.id, TENANT_ID);
    expect(listed).toHaveLength(1);

    const updated = await updateOffer(prisma, created.id, TENANT_ID, { isActive: false });
    expect(updated.isActive).toBe(false);

    const deleted = await deleteOffer(prisma, created.id, TENANT_ID);
    expect(deleted).toEqual({ ok: true });
  });

  it("blocks shrinking maxRedemptions below what's already been redeemed", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch();
    const offer = await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 2 });
    await prisma.batchDiscountOffer.update({ where: { id: offer.id }, data: { redeemedCount: 2 } });

    await expect(updateOffer(prisma, offer.id, TENANT_ID, { maxRedemptions: 1 }))
      .rejects.toThrow("MAX_REDEMPTIONS_BELOW_REDEEMED_COUNT");
  });

  it("blocks deleting an offer that's already been redeemed", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch();
    const offer = await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 2 });
    await prisma.batchDiscountOffer.update({ where: { id: offer.id }, data: { redeemedCount: 1 } });

    const result = await deleteOffer(prisma, offer.id, TENANT_ID);
    expect(result).toEqual({ ok: false, hasRedemptions: true, redeemedCount: 1 });
  });
});

describe("POST /api/students/admit — batch discount offer redemption", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("gives the offer discount to the first N students, then falls back to the course discount", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(100); // course standing discount = 100
    await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 2 });
    const token = await adminToken();

    const res1 = await admitStudent(token, batch.id, "9111111101");
    const res2 = await admitStudent(token, batch.id, "9111111102");
    const res3 = await admitStudent(token, batch.id, "9111111103");
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res3.status).toBe(201);

    const schedule1 = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res1.body.student.id } } });
    const schedule2 = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res2.body.student.id } } });
    const schedule3 = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res3.body.student.id } } });

    // First 2 students get the offer's 500 discount.
    expect(Number(schedule1!.discountAmount)).toBe(500);
    expect(Number(schedule2!.discountAmount)).toBe(500);
    // Offer exhausted — 3rd student falls back to the course's 100 discount.
    expect(Number(schedule3!.discountAmount)).toBe(100);

    const offer = await prisma.batchDiscountOffer.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(offer.redeemedCount).toBe(2); // not 3 — the 3rd admission never redeemed it
  });

  it("does not apply an inactive offer, even with redemption slots remaining", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(100);
    const offer = await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 5 });
    await updateOffer(prisma, offer.id, TENANT_ID, { isActive: false });
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9111111201");
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(Number(schedule!.discountAmount)).toBe(100); // course discount, offer ignored
  });

  it("applies no discount at all when neither an offer nor a course discount exists", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(0);
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9111111301");
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(Number(schedule!.discountAmount)).toBe(0);
    expect(Number(schedule!.effectiveFee)).toBe(12000);
  });

  it("a manual per-student discount overrides the offer and does not consume a redemption slot", async () => {
    await makeTenantCenter();
    const { batch } = await makeCourseBatch(100);
    await createOffer(prisma, batch.id, TENANT_ID, { discountAmount: 500, maxRedemptions: 2 });
    const token = await adminToken();

    const res = await admitStudent(token, batch.id, "9111111401", { discountAmount: 3000, discountReason: "Manual override" });
    expect(res.status).toBe(201);

    const schedule = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res.body.student.id } } });
    expect(Number(schedule!.discountAmount)).toBe(3000); // manual, not the offer's 500 or course's 100
    expect(schedule!.discountReason).toBe("Manual override");

    const offer = await prisma.batchDiscountOffer.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(offer.redeemedCount).toBe(0); // manual override never redeems the offer

    // The offer's 2 slots are still fully available for the next 2 real admissions.
    const res2 = await admitStudent(token, batch.id, "9111111402");
    const res3 = await admitStudent(token, batch.id, "9111111403");
    const schedule2 = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res2.body.student.id } } });
    const schedule3 = await prisma.studentFeeSchedule.findFirst({ where: { enrollment: { studentId: res3.body.student.id } } });
    expect(Number(schedule2!.discountAmount)).toBe(500);
    expect(Number(schedule3!.discountAmount)).toBe(500);
  });
});
