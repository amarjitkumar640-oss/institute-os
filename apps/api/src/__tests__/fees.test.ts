import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";
import {
  getFeeSummary,
  listSchedules,
  getScheduleDetail,
  getCollectionSummary,
  getCollectionByBatch,
  applyDiscount,
} from "../modules/fees/fees.service";

const TENANT_ID = "55555555-5555-5555-5555-555555555555";
const CENTER_ID = "66666666-6666-6666-6666-666666666666";

async function makeTenantCenter() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: {},
    create: { id: TENANT_ID, name: "Fees Test Institute", slug: "fees-test-institute" },
  });
  await prisma.center.upsert({
    where: { id: CENTER_ID }, update: {},
    create: { id: CENTER_ID, tenantId: TENANT_ID, name: "Main Center", address: "Somewhere" },
  });
}

async function makeBatch(name: string) {
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: `${name} Course`, durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, centerId: CENTER_ID, name,
      capacity: 50, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    },
  });
}

let studentSeq = 0;

// Creates one student + enrollment + fee schedule with exactly the given
// installment rows (full control over paidAmount/dueDate/stored status —
// needed to simulate a row that's drifted stale, which real usage can only
// produce by leaving an installment untouched past its dueDate).
async function makeStudentWithInstallments(
  batchId: string,
  installments: Array<{ plannedAmount: number; paidAmount?: number; waivedAmount?: number; dueDate: Date; status: "pending" | "partial" | "paid" | "overdue" | "waived" | "deferred" }>,
) {
  studentSeq += 1;
  const student = await prisma.student.create({
    data: {
      tenantId: TENANT_ID, studentCode: `FEE-TEST-${studentSeq}`, centerId: CENTER_ID,
      fullName: `Fee Test Student ${studentSeq}`, phone: `9${String(studentSeq).padStart(9, "0")}`,
    },
  });
  const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, batchId } });
  const totalFee = installments.reduce((sum, i) => sum + i.plannedAmount, 0);
  const schedule = await prisma.studentFeeSchedule.create({
    data: { enrollmentId: enrollment.id, totalFee, effectiveFee: totalFee, status: "active" },
  });
  for (const [i, inst] of installments.entries()) {
    await prisma.scheduleInstallment.create({
      data: {
        scheduleId: schedule.id, sortOrder: i, label: `Installment ${i + 1}`,
        plannedAmount: inst.plannedAmount, paidAmount: inst.paidAmount ?? 0, waivedAmount: inst.waivedAmount ?? 0,
        dueDate: inst.dueDate, status: inst.status,
      },
    });
  }
  return { student, enrollment, schedule };
}

async function makePayment(scheduleId: string, amount: number, paidAt: Date) {
  return prisma.paymentTransaction.create({
    data: { tenantId: TENANT_ID, scheduleId, amount, mode: "cash", type: "payment", paidAt, receiptNo: `RCP-TEST-${Math.random()}` },
  });
}

describe("fees.service — live overdue reclassification", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  // The core bug: an installment that fell overdue purely by the passage of
  // time, with no payment/edit event ever touching it, stays stored as
  // "pending" forever (only computeInstallmentStatus's call sites in
  // recordPayment/editInstallment ever persist a new value). Every read
  // path below must see it as overdue anyway, computed live.
  it("counts a stale-'pending'-but-actually-overdue installment as overdue in getFeeSummary", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Drift Batch");
    await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2026-06-15"), status: "pending" },
    ]);

    const summary = await getFeeSummary(prisma, TENANT_ID, [CENTER_ID]);
    expect(summary.overdueCount).toBe(1);
    expect(summary.pending).toBe(5000); // already correct pre-fix: "pending" IN-list already included "pending"
  });

  it("includes the stale row under the 'overdue' filter and excludes it from 'active' in listSchedules", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Drift Batch");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2026-06-15"), status: "pending" },
    ]);

    const overdueList = await listSchedules(prisma, TENANT_ID, [CENTER_ID], { status: "overdue" });
    expect(overdueList.map((s) => s.id)).toContain(schedule.id);

    const activeList = await listSchedules(prisma, TENANT_ID, [CENTER_ID], { status: "active" });
    expect(activeList.map((s) => s.id)).not.toContain(schedule.id);
  });

  it("does not misclassify a not-yet-due pending installment as overdue", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Future Batch");
    await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2099-01-01"), status: "pending" },
    ]);

    const summary = await getFeeSummary(prisma, TENANT_ID, [CENTER_ID]);
    expect(summary.overdueCount).toBe(0);
  });

  it("returns the recomputed live status on the schedule detail view, not the stale stored one", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Drift Batch");
    const { enrollment } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2026-06-15"), status: "pending" },
    ]);

    const detail = await getScheduleDetail(prisma, enrollment.id, TENANT_ID);
    expect(detail!.installments[0].status).toBe("overdue");
  });

  it("still treats a genuinely partial installment as partial, never overdue, regardless of dueDate", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Partial Batch");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 2000, dueDate: new Date("2026-01-01"), status: "partial" },
    ]);

    const summary = await getFeeSummary(prisma, TENANT_ID, [CENTER_ID]);
    expect(summary.overdueCount).toBe(0);

    const partialList = await listSchedules(prisma, TENANT_ID, [CENTER_ID], { status: "partial" });
    expect(partialList.map((s) => s.id)).toContain(schedule.id);
  });
});

describe("fees.service — collection dashboard", () => {
  // Only Date is frozen — setTimeout/setInterval stay real, so Prisma's own
  // internal timers (and supertest's HTTP calls in the route tests below)
  // are unaffected. 2026-08-26 is a Wednesday, so the Monday-start week
  // began 2026-08-24 — chosen so each bucket below is unambiguous.
  const NOW = new Date("2026-08-26T12:00:00.000Z");

  beforeAll(() => {
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout", "hrtime", "performance", "queueMicrotask"],
    });
  });
  beforeEach(async () => {
    jest.setSystemTime(NOW);
    await resetDb();
  });
  afterAll(async () => {
    jest.useRealTimers();
    await prisma.$disconnect();
  });

  it("buckets collected amounts into today/week/month/year correctly", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Collection Batch");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 100000, paidAmount: 0, dueDate: new Date("2099-01-01"), status: "pending" },
    ]);

    await makePayment(schedule.id, 100, new Date("2026-08-26T09:00:00.000Z")); // today
    await makePayment(schedule.id, 200, new Date("2026-08-24T09:00:00.000Z")); // this week (Monday), not today
    await makePayment(schedule.id, 400, new Date("2026-08-23T09:00:00.000Z")); // last week, this month
    await makePayment(schedule.id, 800, new Date("2026-08-01T09:00:00.000Z")); // this month, not this week
    await makePayment(schedule.id, 1600, new Date("2026-07-15T09:00:00.000Z")); // this year, not this month
    await makePayment(schedule.id, 3200, new Date("2025-01-01T09:00:00.000Z")); // last year — none of the buckets

    const summary = await getCollectionSummary(prisma, TENANT_ID, [CENTER_ID]);
    expect(summary.collectedToday).toBe(100);
    expect(summary.collectedThisWeek).toBe(300);   // 100 + 200
    expect(summary.collectedThisMonth).toBe(1500); // 100 + 200 + 400 + 800
    expect(summary.collectedThisYear).toBe(3100);  // everything except the 2025 payment
  });

  it("reports live pending/overdue in the same summary", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Collection Batch");
    await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2026-06-15"), status: "pending" }, // stale, actually overdue
    ]);

    const summary = await getCollectionSummary(prisma, TENANT_ID, [CENTER_ID]);
    expect(summary.overdueCount).toBe(1);
    expect(summary.totalPending).toBe(5000);
  });

  it("breaks collected/pending down per batch for the selected period, including a batch with zero activity", async () => {
    await makeTenantCenter();
    const batchA = await makeBatch("Batch A");
    const batchB = await makeBatch("Batch B");
    const emptyBatch = await makeBatch("Empty Batch");

    const { schedule: scheduleA } = await makeStudentWithInstallments(batchA.id, [
      { plannedAmount: 5000, paidAmount: 0, dueDate: new Date("2099-01-01"), status: "pending" },
    ]);
    await makePayment(scheduleA.id, 500, new Date("2026-08-26T09:00:00.000Z")); // today
    await makePayment(scheduleA.id, 700, new Date("2026-07-01T09:00:00.000Z")); // this year, not this month

    const { schedule: scheduleB } = await makeStudentWithInstallments(batchB.id, [
      { plannedAmount: 3000, paidAmount: 1000, dueDate: new Date("2026-01-01"), status: "partial" },
    ]);
    await makePayment(scheduleB.id, 1000, new Date("2026-08-25T09:00:00.000Z")); // this week, this month

    const monthView = await getCollectionByBatch(prisma, TENANT_ID, [CENTER_ID], "month");
    const byId = Object.fromEntries(monthView.batches.map((b) => [b.batchId, b]));

    expect(byId[batchA.id].collectedAmount).toBe(500); // the July payment falls outside "month"
    expect(byId[batchA.id].pendingAmount).toBe(5000);
    expect(byId[batchA.id].pendingStudentCount).toBe(1);

    expect(byId[batchB.id].collectedAmount).toBe(1000);
    expect(byId[batchB.id].pendingAmount).toBe(2000); // 3000 - 1000 paid
    expect(byId[batchB.id].pendingStudentCount).toBe(1);

    expect(byId[emptyBatch.id].collectedAmount).toBe(0);
    expect(byId[emptyBatch.id].pendingAmount).toBe(0);
    expect(byId[emptyBatch.id].pendingStudentCount).toBe(0);

    const yearView = await getCollectionByBatch(prisma, TENANT_ID, [CENTER_ID], "year");
    expect(yearView.batches.find((b) => b.batchId === batchA.id)!.collectedAmount).toBe(1200); // 500 + 700
  });

  it("excludes a fully-paid installment from pending even if its stored status is stale", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Settled Batch");
    await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 5000, paidAmount: 5000, dueDate: new Date("2026-01-01"), status: "pending" }, // never recomputed to "paid"
    ]);

    const view = await getCollectionByBatch(prisma, TENANT_ID, [CENTER_ID], "month");
    const row = view.batches.find((b) => b.batchId === batch.id)!;
    expect(row.pendingAmount).toBe(0);
    expect(row.pendingStudentCount).toBe(0);
  });
});

describe("GET /api/fees/collection-summary and /collection-by-batch", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  async function makeAdmin() {
    const passwordHash = await bcrypt.hash("secret123", 10);
    return prisma.staff.create({
      data: { tenantId: TENANT_ID, fullName: "Admin User", phone: "9999999998", email: "fees-admin@x.test", roles: ["admin"], passwordHash },
    });
  }
  function tokenFor(payload: AuthPayload) {
    const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
    return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  }

  it("returns the collection summary shape for an authorized admin", async () => {
    await makeTenantCenter();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const res = await request(app).get("/api/fees/collection-summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        collectedToday: expect.any(Number),
        collectedThisWeek: expect.any(Number),
        collectedThisMonth: expect.any(Number),
        collectedThisYear: expect.any(Number),
        totalPending: expect.any(Number),
        overdueCount: expect.any(Number),
      }),
    );
  });

  it("requires a valid period on /collection-by-batch", async () => {
    await makeTenantCenter();
    const staff = await makeAdmin();
    const token = tokenFor({ staffId: staff.id, roles: ["admin"], activeRole: "admin", centerId: CENTER_ID, tenantId: TENANT_ID });

    const bad = await request(app).get("/api/fees/collection-by-batch").set("Authorization", `Bearer ${token}`);
    expect(bad.status).toBe(400);

    const good = await request(app).get("/api/fees/collection-by-batch?period=month").set("Authorization", `Bearer ${token}`);
    expect(good.status).toBe(200);
    expect(good.body.period).toBe("month");
    expect(Array.isArray(good.body.batches)).toBe(true);
  });
});

describe("fees.service — applyDiscount reconciles installment amounts", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("reduces only the last installment when the discount fits within its remaining balance", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Discount Batch A");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 6000, dueDate: new Date("2026-01-01"), status: "pending" },
      { plannedAmount: 6000, dueDate: new Date("2026-02-01"), status: "pending" },
    ]);

    const updated = await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 1000 });

    expect(Number(updated.effectiveFee)).toBe(11000);
    const [first, second] = updated.installments;
    expect(Number(first.plannedAmount)).toBe(6000);
    expect(Number(second.plannedAmount)).toBe(5000);
  });

  it("spills the discount onto the next-earlier installment once the last one is fully absorbed", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Discount Batch B");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 6000, dueDate: new Date("2026-01-01"), status: "pending" },
      { plannedAmount: 6000, dueDate: new Date("2026-02-01"), status: "pending" },
    ]);

    const updated = await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 7000 });

    expect(Number(updated.effectiveFee)).toBe(5000);
    const [first, second] = updated.installments;
    expect(Number(second.plannedAmount)).toBe(0);
    expect(second.status).toBe("paid"); // zero outstanding on a zero-planned row
    expect(Number(first.plannedAmount)).toBe(5000);
    expect(Number(first.plannedAmount) + Number(second.plannedAmount)).toBe(5000);
  });

  it("never reduces an installment's plannedAmount below what's already been paid on it", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Discount Batch C");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 12000, paidAmount: 5000, dueDate: new Date("2026-01-01"), status: "partial" },
    ]);

    const updated = await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 3000 });

    expect(Number(updated.effectiveFee)).toBe(9000);
    const [inst] = updated.installments;
    expect(Number(inst.paidAmount)).toBe(5000); // untouched
    expect(Number(inst.plannedAmount)).toBe(9000); // 12000 - 3000, still >= paidAmount
    expect(inst.status).toBe("partial");
  });

  it("does not error or go negative when the discount exceeds every unpaid installment's remaining balance", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Discount Batch D");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 6000, paidAmount: 6000, dueDate: new Date("2026-01-01"), status: "paid" },
      { plannedAmount: 6000, dueDate: new Date("2026-02-01"), status: "pending" },
    ]);

    const updated = await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 10000 });

    expect(Number(updated.effectiveFee)).toBe(2000); // 12000 - 10000, even though only 6000 could be reclaimed
    const [first, second] = updated.installments;
    expect(Number(first.plannedAmount)).toBe(6000); // already fully paid — untouched, floor holds
    expect(Number(first.paidAmount)).toBe(6000);
    expect(Number(second.plannedAmount)).toBe(0); // fully absorbed the reclaimable part
  });

  it("restores amount onto the last installment when an existing discount is decreased", async () => {
    await makeTenantCenter();
    const batch = await makeBatch("Discount Batch E");
    const { schedule } = await makeStudentWithInstallments(batch.id, [
      { plannedAmount: 6000, dueDate: new Date("2026-01-01"), status: "pending" },
      { plannedAmount: 6000, dueDate: new Date("2026-02-01"), status: "pending" },
    ]);

    await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 1000 });
    const updated = await applyDiscount(prisma, schedule.id, TENANT_ID, { discountAmount: 400 });

    expect(Number(updated.effectiveFee)).toBe(11600);
    const [first, second] = updated.installments;
    expect(Number(first.plannedAmount)).toBe(6000); // unaffected by either change
    expect(Number(second.plannedAmount)).toBe(5600); // 5000 (after first discount) + 600 restored
  });
});
