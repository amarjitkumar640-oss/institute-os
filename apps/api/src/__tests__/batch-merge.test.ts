import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import {
  mergeBatch, BatchNotFoundError, SameBatchError, EmptySourceBatchError,
} from "../modules/batches/batch-merge.service";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

async function ensureTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute", slug: "test-institute" },
  });
}

async function makeCourse(name: string, fee: number) {
  await ensureTenant();
  return prisma.course.create({
    data: { tenantId: TENANT_ID, name, durationMonths: 6, defaultFee: fee },
  });
}

async function makeBatch(courseId: string, name: string, capacity: number) {
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId, name, capacity,
      startDate: new Date(), endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    },
  });
}

async function makeStudentWithSchedule(batchId: string, name: string, totalFee: number, paid: number) {
  const student = await prisma.student.create({
    data: { tenantId: TENANT_ID, studentCode: `INS-2026-${Math.random().toString(36).slice(2, 8)}`, fullName: name, phone: `9${Math.floor(Math.random() * 1e9)}` },
  });
  const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, batchId } });
  const schedule = await prisma.studentFeeSchedule.create({
    data: {
      enrollmentId: enrollment.id, totalFee, discountAmount: 0, effectiveFee: totalFee, creditBalance: 0,
      status: paid >= totalFee ? "completed" : "active",
      installments: {
        create: [{ sortOrder: 0, label: "Payment 1", plannedAmount: paid, paidAmount: paid, dueDate: new Date(), status: paid > 0 ? "paid" : "pending" }],
      },
    },
  });
  return { student, enrollment, schedule };
}

describe("mergeBatch", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("moves active enrollments in place, keeping the fee schedule linked, and marks the source batch merged", async () => {
    const course = await makeCourse("Foundation", 10000);
    const fromBatch = await makeBatch(course.id, "Foundation-A", 10);
    const toBatch = await makeBatch(course.id, "Foundation-B", 10);

    const { student, enrollment, schedule } = await makeStudentWithSchedule(fromBatch.id, "Sampa Soren", 12000, 9000);

    const result = await mergeBatch(prisma, TENANT_ID, fromBatch.id, toBatch.id);

    expect(result.mergedCount).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.sourceBatchStatus).toBe("merged");

    // Same enrollment row, just repointed — not dropped + recreated.
    const updatedEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updatedEnrollment.batchId).toBe(toBatch.id);
    expect(updatedEnrollment.status).toBe("active");
    expect(updatedEnrollment.enrolledOn.getTime()).toBe(enrollment.enrolledOn.getTime());

    // Fee schedule still resolves — never orphaned.
    const scheduleAfter = await prisma.studentFeeSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
      include: { enrollment: true },
    });
    expect(scheduleAfter.enrollment.batchId).toBe(toBatch.id);
    expect(Number(scheduleAfter.totalFee)).toBe(12000); // untouched by the merge

    // courseId on the student's own record is untouched (still whatever it was, i.e. null here).
    const studentAfter = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(studentAfter.courseId).toBeNull();

    const fromBatchAfter = await prisma.batch.findUniqueOrThrow({ where: { id: fromBatch.id } });
    expect(fromBatchAfter.status).toBe("merged");
  });

  it("allows merging across different courses without touching fee or courseId", async () => {
    const courseA = await makeCourse("SSC Foundation", 10000);
    const courseB = await makeCourse("Banking Foundation", 15000);
    const fromBatch = await makeBatch(courseA.id, "SSC-A", 10);
    const toBatch = await makeBatch(courseB.id, "Banking-A", 10);

    await makeStudentWithSchedule(fromBatch.id, "Krishna Manki", 10000, 6000);

    const result = await mergeBatch(prisma, TENANT_ID, fromBatch.id, toBatch.id);
    expect(result.mergedCount).toBe(1);

    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { batchId: toBatch.id }, include: { feeSchedule: true } });
    expect(Number(enrollment.feeSchedule!.totalFee)).toBe(10000); // still SSC's fee, not Banking's
  });

  it("deactivates the source batch's class slots once fully emptied", async () => {
    const course = await makeCourse("Foundation", 10000);
    const fromBatch = await makeBatch(course.id, "Foundation-A", 10);
    const toBatch = await makeBatch(course.id, "Foundation-B", 10);
    await makeStudentWithSchedule(fromBatch.id, "Student One", 10000, 10000);

    const slot = await prisma.classSlot.create({
      data: { batchId: fromBatch.id, dayOfWeek: "monday", startTime: "09:00", endTime: "10:00", validFrom: new Date() },
    });

    await mergeBatch(prisma, TENANT_ID, fromBatch.id, toBatch.id);

    const slotAfter = await prisma.classSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(slotAfter.isActive).toBe(false);
  });

  it("reports (not fails) students the target is too full for, and leaves them in the source batch", async () => {
    const course = await makeCourse("Foundation", 10000);
    const fromBatch = await makeBatch(course.id, "Foundation-A", 10);
    const toBatch = await makeBatch(course.id, "Foundation-B", 1); // room for exactly 1

    await makeStudentWithSchedule(fromBatch.id, "Fits", 10000, 0);
    const { student: overflow } = await makeStudentWithSchedule(fromBatch.id, "Overflow", 10000, 0);

    const result = await mergeBatch(prisma, TENANT_ID, fromBatch.id, toBatch.id);

    expect(result.mergedCount).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/full/i);
    expect(result.sourceBatchStatus).toBeNull(); // one student still active in the source batch

    const overflowEnrollment = await prisma.enrollment.findFirstOrThrow({ where: { studentId: overflow.id } });
    expect(overflowEnrollment.batchId).toBe(fromBatch.id);
    expect(overflowEnrollment.status).toBe("active");
  });

  it("reports (not fails) a student who already has a record in the target batch", async () => {
    const course = await makeCourse("Foundation", 10000);
    const fromBatch = await makeBatch(course.id, "Foundation-A", 10);
    const toBatch = await makeBatch(course.id, "Foundation-B", 10);

    const { student } = await makeStudentWithSchedule(fromBatch.id, "Repeat Student", 10000, 0);
    // This student was previously in toBatch and dropped out of it.
    await prisma.enrollment.create({ data: { studentId: student.id, batchId: toBatch.id, status: "dropped" } });

    const result = await mergeBatch(prisma, TENANT_ID, fromBatch.id, toBatch.id);

    expect(result.mergedCount).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/manual handling/i);
  });

  it("throws SameBatchError, BatchNotFoundError, and EmptySourceBatchError appropriately", async () => {
    const course = await makeCourse("Foundation", 10000);
    const batch = await makeBatch(course.id, "Foundation-A", 10);
    const emptyOther = await makeBatch(course.id, "Foundation-B", 10);

    await expect(mergeBatch(prisma, TENANT_ID, batch.id, batch.id)).rejects.toBeInstanceOf(SameBatchError);
    await expect(mergeBatch(prisma, TENANT_ID, batch.id, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(BatchNotFoundError);
    await expect(mergeBatch(prisma, TENANT_ID, batch.id, emptyOther.id)).rejects.toBeInstanceOf(EmptySourceBatchError);
  });
});
