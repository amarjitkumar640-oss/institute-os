import { Prisma, PrismaClient } from "@prisma/client";
import type { LegacyStudentInput } from "@institute-os/shared";
import { generateStudentCode } from "./students.service";
import { createEnrollment, BatchFullError, AlreadyEnrolledError } from "../enrollments/enrollments.service";
import { generateReceiptNo } from "../fees/fees.service";

type Tx = PrismaClient | Prisma.TransactionClient;

export class DuplicateLegacyIdError extends Error {
  constructor(legacyId: string, existingStudentCode: string) {
    super(`A student with legacy ID ${legacyId} already exists (${existingStudentCode})`);
  }
}

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function todayDateOnly(): Date {
  return toDateOnly(new Date().toISOString().slice(0, 10));
}

interface ImportLegacyStudentParams {
  tenantId: string;
  centerId: string;
  batchId: string;
  // The target batch's own course — used as the default "Course Applied
  // For" (Student.courseId) unless a specific student's `input.courseId`
  // overrides it (see legacyStudentSchema's comment for why that override
  // exists: it mirrors the normal Admit Student form, where course and
  // batch are picked independently).
  defaultCourseId: string | null;
  staffId: string | null;
  input: LegacyStudentInput;
}

// Backfills one paper-register student: creates the Student, enrolls them
// into the given batch, and rebuilds their fee history so it behaves like
// any other student's schedule from here on (dues/overdue reports, etc. all
// just work). Unlike generateSchedule() (used for new admissions), this
// never touches the course's fee template — a template's computed due-date
// rules describe a *future* payment plan, and these are real historical
// payments that already happened on their own irregular dates. Each
// register payment row becomes its own already-`paid` installment (so the
// original receipt number and date survive), plus one trailing "Balance
// Due" installment if totalFee wasn't fully covered yet.
export async function importLegacyStudent(tx: Tx, params: ImportLegacyStudentParams) {
  const { tenantId, centerId, batchId, defaultCourseId, staffId, input } = params;
  const courseId = input.courseId ?? defaultCourseId;

  // Catches both a duplicate legacyId already sitting in the DB (a re-run of
  // the same import file, or an overlapping paper-register range) and a
  // duplicate within the same bulk-import payload — each row commits in its
  // own transaction before the next one starts, so an earlier row's insert
  // is already visible here by the time a later, colliding row is checked.
  const existing = await tx.student.findFirst({
    where: { tenantId, legacyId: input.legacyId },
    select: { studentCode: true },
  });
  if (existing) throw new DuplicateLegacyIdError(input.legacyId, existing.studentCode);

  const studentCode = await generateStudentCode(tx as PrismaClient, tenantId, centerId);
  const student = await tx.student.create({
    data: {
      tenantId,
      studentCode,
      centerId,
      courseId,
      legacyId:      input.legacyId,
      fullName:      input.fullName,
      phone:         input.phone,
      email:         input.email ?? null,
      aadhaar:       input.aadhaar ?? null,
      fatherName:    input.fatherName ?? null,
      motherName:    input.motherName ?? null,
      gender:        input.gender ?? null,
      address:       input.address ?? null,
      qualification: input.qualification ?? null,
      passYear:      input.passYear ?? null,
      board:         input.board ?? null,
      guardianPhone: input.guardianPhone ?? null,
    },
  });

  const enrollment = await createEnrollment(tx, student.id, batchId, tenantId);

  // Missing totalFee → the resolved course's own defaultFee (same number
  // the UI would have pre-filled), not the sum of payments — a partly-paid
  // student's total shouldn't silently become "exactly what they've paid."
  let totalFee = input.totalFee;
  if (totalFee == null) {
    const course = courseId ? await tx.course.findUnique({ where: { id: courseId }, select: { defaultFee: true } }) : null;
    totalFee = Number(course?.defaultFee ?? 0);
  }
  const paidTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);

  const schedule = await tx.studentFeeSchedule.create({
    data: {
      enrollmentId:   enrollment.id,
      totalFee,
      discountAmount: 0,
      effectiveFee:   totalFee,
      creditBalance:  0,
      status:         paidTotal >= totalFee ? "completed" : "active",
    },
  });

  let sortOrder = 0;
  for (const payment of input.payments) {
    const dueDate = toDateOnly(payment.date);
    const installment = await tx.scheduleInstallment.create({
      data: {
        scheduleId:    schedule.id,
        sortOrder:     sortOrder++,
        label:         payment.receiptNo ? `Receipt ${payment.receiptNo}` : `Payment ${sortOrder}`,
        plannedAmount: payment.amount,
        paidAmount:    payment.amount,
        dueDate,
        status:        "paid",
      },
    });

    // Always our own auto-generated receiptNo — same as any payment
    // recorded live through the normal fee screens — never the register's
    // own number, which isn't guaranteed unique. That number, if given, is
    // preserved separately as legacyReceiptNo purely for reference.
    await tx.paymentTransaction.create({
      data: {
        tenantId,
        scheduleId:      schedule.id,
        installmentId:   installment.id,
        amount:          payment.amount,
        mode:            "cash",
        type:            "payment",
        receiptNo:       generateReceiptNo(),
        legacyReceiptNo: payment.receiptNo ?? null,
        paidAt:          dueDate,
        collectedById:   staffId,
        notes:           "Imported from legacy paper register",
      },
    });
  }

  const remaining = totalFee - paidTotal;
  if (remaining > 0) {
    await tx.scheduleInstallment.create({
      data: {
        scheduleId:    schedule.id,
        sortOrder:     sortOrder++,
        label:         "Balance Due",
        plannedAmount: remaining,
        paidAmount:    0,
        dueDate:       todayDateOnly(),
        status:        "pending",
      },
    });
  }

  return student;
}

// Turns whatever importLegacyStudent() threw into a message safe to show
// directly in the per-row import result — including the "expected" failure
// modes (batch full, already has a row in the target) a bulk run is likely
// to actually hit. Payment receiptNo is always auto-generated now, so a
// P2002 here is an unexpected collision, not a normal "duplicate R.No."
// case — surfaced as a generic message rather than guessing a cause.
export function describeLegacyImportError(err: unknown): string {
  if (err instanceof BatchFullError) return err.message;
  if (err instanceof AlreadyEnrolledError) return err.message;
  if (err instanceof DuplicateLegacyIdError) return err.message;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return "A unique value in this entry collided with an existing record — please retry.";
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
