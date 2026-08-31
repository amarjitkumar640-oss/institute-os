import { Prisma, PrismaClient, InstallmentStatus } from "@prisma/client";
import type {
  GenerateScheduleInput,
  EditInstallmentInput,
  RecordPaymentInput,
  UpsertFeeTemplateInput,
} from "@institute-os/shared";

// ── Receipt number ────────────────────────────────────────────────────────────

export function generateReceiptNo(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `RCP-${ts}-${rand}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateOnly(date: Date): Date {
  return new Date(date.toISOString().split("T")[0] + "T00:00:00.000Z");
}

// ── Due date computation ──────────────────────────────────────────────────────

function computeDueDate(
  baseDate:   Date,
  trigger:    string,
  offsetDays: number,
  dayOfMonth: number,
  splitIndex: number,
  existing:   { dueDate: Date }[],
): Date {
  switch (trigger) {
    case "on_admission":
      return baseDate;

    case "days_after_admission":
      return toDateOnly(addDays(baseDate, offsetDays));

    case "days_after_previous": {
      const prev = existing.at(-1);
      return toDateOnly(prev ? addDays(prev.dueDate, offsetDays) : addDays(baseDate, offsetDays));
    }

    case "monthly_recurring": {
      const d = addMonths(baseDate, splitIndex + 1);
      const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(dayOfMonth, maxDay));
      return toDateOnly(d);
    }

    default:
      return baseDate;
  }
}

// ── Outstanding (pending fee) — the single canonical formula ──────────────────
//
// outstanding = effectiveFee − Σpaid − Σwaived − creditBalance
//
// Deliberately NOT date-aware — an installment not yet due still counts
// toward what the student owes overall; dueDate only ever decides whether an
// installment is labeled "overdue" for badges/counts, never whether it's
// excluded from this total. Also deliberately excludes lateFee: a late fee
// is a separate penalty charge, not part of the course fee being tracked
// here (recordPayment's own per-installment allocation math adds lateFee
// back in separately, where it's actually being collected against).
export function computeScheduleOutstanding(
  effectiveFee:  number,
  creditBalance: number,
  installments:  { paidAmount: number; waivedAmount: number }[],
): number {
  const paid   = installments.reduce((sum, i) => sum + i.paidAmount, 0);
  const waived = installments.reduce((sum, i) => sum + i.waivedAmount, 0);
  return Math.max(0, effectiveFee - paid - waived - creditBalance);
}

// ── Installment status machine ────────────────────────────────────────────────

export function computeInstallmentStatus(
  plannedAmount: number,
  paidAmount:    number,
  waivedAmount:  number,
  dueDate:       Date,
  current:       InstallmentStatus,
): InstallmentStatus {
  if (current === "waived" || current === "deferred") return current;
  const outstanding = plannedAmount - paidAmount - waivedAmount;
  if (outstanding <= 0)  return "paid";
  if (paidAmount > 0)    return "partial";
  if (new Date() > dueDate) return "overdue";
  return "pending";
}

// ── Fee template CRUD ─────────────────────────────────────────────────────────

export async function upsertFeeTemplate(
  db:       PrismaClient,
  courseId: string,
  tenantId: string,
  input:    UpsertFeeTemplateInput,
) {
  const course = await db.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) throw new Error("COURSE_NOT_FOUND");

  const existing = await db.courseFeeTemplate.findUnique({ where: { courseId } });

  const lineData = input.lines.map((l) => ({
    sortOrder:  l.sortOrder,
    label:      l.label,
    lineType:   l.lineType,
    trigger:    l.trigger,
    amount:     l.amount     ?? null,
    percentage: l.percentage ?? null,
    splitCount: l.splitCount ?? null,
    offsetDays: l.offsetDays ?? null,
    dayOfMonth: l.dayOfMonth ?? null,
  }));

  if (existing) {
    await db.templateLine.deleteMany({ where: { templateId: existing.id } });
    return db.courseFeeTemplate.update({
      where:   { courseId },
      data:    { notes: input.notes ?? null, lines: { create: lineData } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  }

  return db.courseFeeTemplate.create({
    data:    { courseId, notes: input.notes ?? null, lines: { create: lineData } },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function getFeeTemplate(db: PrismaClient, courseId: string, tenantId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) return null;

  return db.courseFeeTemplate.findUnique({
    where:   { courseId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
}

// ── Generate student fee schedule from template ───────────────────────────────

export async function generateSchedule(
  db:           PrismaClient,
  enrollmentId: string,
  input:        GenerateScheduleInput,
  tenantId?:    string,
) {
  const existing = await db.studentFeeSchedule.findUnique({ where: { enrollmentId } });
  if (existing) throw new Error("SCHEDULE_ALREADY_EXISTS");

  const enrollment = await db.enrollment.findFirst({
    where:   { id: enrollmentId, ...(tenantId ? { batch: { tenantId } } : {}) },
    include: {
      batch: {
        include: {
          course: {
            include: { feeTemplate: { include: { lines: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
      },
    },
  });
  if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");

  const discountAmount = input.discountAmount ?? 0;
  const effectiveFee   = input.totalFee - discountAmount;
  if (effectiveFee < 0) throw new Error("DISCOUNT_EXCEEDS_FEE");

  const baseDate = toDateOnly(
    input.enrollmentDate ? new Date(input.enrollmentDate + "T00:00:00.000Z") : new Date(),
  );

  const lines = enrollment.batch.course.feeTemplate?.lines ?? [];

  type CalcLine = { label: string; sortOrder: number; amount: number; dueDate: Date };
  const calculated: CalcLine[] = [];
  let allocated = 0;

  for (const line of lines) {
    if (line.lineType === "equal_split") {
      const splits    = line.splitCount ?? 1;
      const remaining = effectiveFee - allocated;
      const perUnit   = Math.round(remaining / splits);
      for (let i = 0; i < splits; i++) {
        const dueDate = computeDueDate(baseDate, line.trigger, line.offsetDays ?? 0, line.dayOfMonth ?? 1, i, calculated);
        calculated.push({
          label:     splits > 1 ? `${line.label} ${i + 1}` : line.label,
          sortOrder: line.sortOrder * 100 + i,
          amount:    perUnit,
          dueDate,
        });
        allocated += perUnit;
      }
      continue;
    }

    let amount = 0;
    if (line.lineType === "fixed") {
      amount = Number(line.amount ?? 0);
    } else if (line.lineType === "percentage") {
      amount = Math.round((Number(line.percentage ?? 0) / 100) * effectiveFee);
    } else if (line.lineType === "remaining") {
      amount = effectiveFee - allocated;
    }

    const dueDate = computeDueDate(baseDate, line.trigger, line.offsetDays ?? 0, line.dayOfMonth ?? 1, 0, calculated);
    calculated.push({ label: line.label, sortOrder: line.sortOrder * 100, amount, dueDate });
    allocated += amount;
  }

  // No template — single lump sum
  if (calculated.length === 0) {
    calculated.push({ label: "Course Fee", sortOrder: 0, amount: effectiveFee, dueDate: baseDate });
  }

  return db.studentFeeSchedule.create({
    data: {
      enrollmentId,
      totalFee:       input.totalFee,
      discountAmount,
      discountReason: input.discountReason ?? null,
      effectiveFee,
      installments: {
        create: calculated.map((c) => ({
          sortOrder:     c.sortOrder,
          label:         c.label,
          plannedAmount: c.amount,
          dueDate:       c.dueDate,
        })),
      },
    },
    include: { installments: { orderBy: { sortOrder: "asc" } } },
  });
}

// ── Apply discount to an existing schedule ────────────────────────────────────

export async function applyDiscount(
  db:         PrismaClient,
  scheduleId: string,
  tenantId:   string,
  input:      { discountAmount: number; discountReason?: string },
) {
  return db.$transaction(async (tx) => {
    const schedule = await tx.studentFeeSchedule.findFirst({
      where: { id: scheduleId, enrollment: { batch: { tenantId } } },
      include: { installments: { orderBy: { sortOrder: "asc" } } },
    });
    if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");

    const effectiveFee = Number(schedule.totalFee) - input.discountAmount;
    if (effectiveFee < 0) throw new Error("DISCOUNT_EXCEEDS_FEE");

    // A schedule-level discount is meaningless if it only moves
    // effectiveFee/discountAmount — the installment table (what staff and
    // the student actually see broken down) has to sum to the new total
    // too, or the last installment would still ask for the pre-discount
    // amount. Reconciled by the DELTA versus whatever discount was already
    // on this schedule (0 the first time an admin applies one), so editing
    // an existing discount later stays correct in both directions:
    //  - Increasing the discount eats into installments LAST-to-FIRST,
    //    never reducing below what's already been paid on that installment
    //    (mirrors recordPayment's own outstanding math, fees.service.ts's
    //    `plannedAmount - paidAmount` floor) — the newest/least-urgent
    //    installment absorbs it first.
    //  - Decreasing the discount (admin walking back a previous discount)
    //    restores the difference onto the last installment — no floor
    //    needed for an increase, it's always valid to ask for more.
    // Waived/deferred installments are skipped entirely in both directions
    // — their shortfall is already accounted for via waivedAmount, and
    // perturbing plannedAmount on an already-resolved installment would be
    // confusing with no benefit to the aggregate totals.
    const delta = input.discountAmount - Number(schedule.discountAmount);
    const eligibleDesc = schedule.installments
      .filter((i) => i.status !== "waived" && i.status !== "deferred")
      .sort((a, b) => b.sortOrder - a.sortOrder);

    if (delta > 0) {
      let remaining = delta;
      for (const inst of eligibleDesc) {
        if (remaining <= 0) break;
        const floor         = Number(inst.paidAmount); // never go below money already collected
        const currentPlanned = Number(inst.plannedAmount);
        const reducible      = currentPlanned - floor;
        if (reducible <= 0) continue;

        const reduceBy  = Math.min(remaining, reducible);
        const newPlanned = currentPlanned - reduceBy;
        remaining -= reduceBy;

        await tx.scheduleInstallment.update({
          where: { id: inst.id },
          data: {
            plannedAmount: newPlanned,
            status: computeInstallmentStatus(
              newPlanned, Number(inst.paidAmount), Number(inst.waivedAmount),
              new Date(inst.dueDate), inst.status,
            ),
          },
        });
      }
    } else if (delta < 0) {
      const last = eligibleDesc[0];
      if (last) {
        const newPlanned = Number(last.plannedAmount) - delta; // delta is negative here, so this restores
        await tx.scheduleInstallment.update({
          where: { id: last.id },
          data: {
            plannedAmount: newPlanned,
            status: computeInstallmentStatus(
              newPlanned, Number(last.paidAmount), Number(last.waivedAmount),
              new Date(last.dueDate), last.status,
            ),
          },
        });
      }
    }

    await tx.studentFeeSchedule.update({
      where: { id: scheduleId },
      data:  {
        discountAmount: input.discountAmount,
        discountReason: input.discountReason ?? null,
        effectiveFee,
      },
    });

    return tx.studentFeeSchedule.findFirstOrThrow({
      where:   { id: scheduleId },
      include: { installments: { orderBy: { sortOrder: "asc" } } },
    });
  });
}

// ── Edit a single installment ─────────────────────────────────────────────────

export async function editInstallment(
  db:            PrismaClient,
  installmentId: string,
  tenantId:      string,
  input:         EditInstallmentInput,
) {
  const inst = await db.scheduleInstallment.findFirst({
    where: { id: installmentId, schedule: { enrollment: { batch: { tenantId } } } },
  });
  if (!inst) throw new Error("INSTALLMENT_NOT_FOUND");

  const plannedAmount = input.plannedAmount ?? Number(inst.plannedAmount);
  const paidAmount    = Number(inst.paidAmount);
  const waivedAmount  = input.waivedAmount ?? Number(inst.waivedAmount);
  const dueDate       = input.dueDate ? new Date(input.dueDate + "T00:00:00") : new Date(inst.dueDate);

  const status = input.status
    ? (input.status as InstallmentStatus)
    : computeInstallmentStatus(plannedAmount, paidAmount, waivedAmount, dueDate, inst.status);

  return db.scheduleInstallment.update({
    where: { id: installmentId },
    data:  {
      label:         input.label         ?? inst.label,
      plannedAmount: input.plannedAmount ?? inst.plannedAmount,
      dueDate,
      waivedAmount:  input.waivedAmount  ?? inst.waivedAmount,
      waivedReason:  input.waivedReason  ?? inst.waivedReason,
      lateFee:       input.lateFee       ?? inst.lateFee,
      notes:         input.notes         ?? inst.notes,
      status,
    },
  });
}

// ── Record a payment ──────────────────────────────────────────────────────────

export async function recordPayment(
  db:       PrismaClient,
  staffId:  string | null,
  tenantId: string,
  input:    RecordPaymentInput,
) {
  return db.$transaction(async (tx) => {
    const schedule = await tx.studentFeeSchedule.findFirst({
      where:   { id: input.scheduleId, enrollment: { batch: { tenantId } } },
      include: { installments: { orderBy: { sortOrder: "asc" } } },
    });
    if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");

    let excess = input.amount;

    if (input.installmentId) {
      // Apply to specific installment; any surplus → creditBalance
      const inst = schedule.installments.find((i) => i.id === input.installmentId);
      if (!inst) throw new Error("INSTALLMENT_NOT_FOUND");

      const outstanding = Number(inst.plannedAmount) + Number(inst.lateFee)
                        - Number(inst.paidAmount) - Number(inst.waivedAmount);
      const applying    = Math.min(excess, outstanding);
      const newPaid     = Number(inst.paidAmount) + applying;
      excess           -= applying;

      const newStatus = computeInstallmentStatus(
        Number(inst.plannedAmount) + Number(inst.lateFee),
        newPaid,
        Number(inst.waivedAmount),
        new Date(inst.dueDate),
        inst.status,
      );

      await tx.scheduleInstallment.update({
        where: { id: inst.id },
        data:  { paidAmount: newPaid, status: newStatus },
      });
    } else {
      // Auto-allocate: walk pending installments in order, fill greedily
      const pending = schedule.installments
        .filter((i) => ["pending", "partial", "overdue"].includes(i.status))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      for (const inst of pending) {
        if (excess <= 0) break;
        const outstanding = Number(inst.plannedAmount) + Number(inst.lateFee)
                          - Number(inst.paidAmount) - Number(inst.waivedAmount);
        if (outstanding <= 0) continue;
        const applying = Math.min(excess, outstanding);
        const newPaid  = Number(inst.paidAmount) + applying;
        excess        -= applying;

        const newStatus = computeInstallmentStatus(
          Number(inst.plannedAmount) + Number(inst.lateFee),
          newPaid,
          Number(inst.waivedAmount),
          new Date(inst.dueDate),
          inst.status,
        );

        await tx.scheduleInstallment.update({
          where: { id: inst.id },
          data:  { paidAmount: newPaid, status: newStatus },
        });
      }
    }

    const txn = await tx.paymentTransaction.create({
      data: {
        tenantId,
        scheduleId:    input.scheduleId,
        installmentId: input.installmentId ?? null,
        amount:        input.amount,
        mode:          input.mode,
        paidAt:        new Date(input.paidAt + "T00:00:00"),
        receiptNo:     generateReceiptNo(),
        collectedById: staffId,
        chequeNo:      input.chequeNo ?? null,
        bankName:      input.bankName ?? null,
        upiRef:        input.upiRef   ?? null,
        notes:         input.notes    ?? null,
      },
    });

    const allInst = await tx.scheduleInstallment.findMany({ where: { scheduleId: input.scheduleId } });
    const allDone = allInst.every((i) => i.status === "paid" || i.status === "waived");

    await tx.studentFeeSchedule.update({
      where: { id: input.scheduleId },
      data:  {
        creditBalance: Number(schedule.creditBalance) + excess,
        status:        allDone ? "completed" : "active",
      },
    });

    return txn;
  });
}

// ── Fetch full schedule detail ────────────────────────────────────────────────

export async function getScheduleDetail(db: PrismaClient, enrollmentId: string, tenantId: string) {
  const schedule = await db.studentFeeSchedule.findFirst({
    where:   { enrollmentId, enrollment: { batch: { tenantId } } },
    include: {
      installments: {
        orderBy: { sortOrder: "asc" },
        include: { transactions: { orderBy: { paidAt: "desc" } } },
      },
      transactions: {
        orderBy: { paidAt: "desc" },
        include: {
          collectedBy:  { select: { id: true, fullName: true } },
          installment:  { select: { id: true, label: true } },
        },
      },
      enrollment: {
        include: {
          student: { select: { id: true, fullName: true, studentCode: true, phone: true, whatsapp: true } },
          batch:   { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!schedule) return null;

  // The stored status only gets recomputed when a payment/edit actually
  // touches the row (see computeInstallmentStatus's call sites above) — an
  // installment sitting untouched since before its dueDate passed stays
  // "pending" forever in the DB even though it's genuinely overdue now.
  // Recomputed live here so the detail view's badge is never stale.
  return {
    ...schedule,
    pendingAmount: computeScheduleOutstanding(
      Number(schedule.effectiveFee),
      Number(schedule.creditBalance),
      schedule.installments.map((i) => ({ paidAmount: Number(i.paidAmount), waivedAmount: Number(i.waivedAmount) })),
    ),
    installments: schedule.installments.map((inst) => ({
      ...inst,
      status: computeInstallmentStatus(
        Number(inst.plannedAmount), Number(inst.paidAmount), Number(inst.waivedAmount),
        new Date(inst.dueDate), inst.status,
      ),
    })),
  };
}

// ── List schedules with summary counts ───────────────────────────────────────

export async function listSchedules(
  db:       PrismaClient,
  tenantId: string,
  centerIds: string[],
  params:   { search?: string; status?: string; batchId?: string },
) {
  const where: Prisma.StudentFeeScheduleWhereInput = {
    enrollment: {
      batch: { tenantId, centerId: { in: centerIds } },
      batchId: params.batchId ?? undefined,
      student: params.search
        ? {
            OR: [
              { fullName:    { contains: params.search, mode: "insensitive" } },
              { studentCode: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : undefined,
    },
  };

  // An installment sitting untouched since before its dueDate passed stays
  // stored as "pending" forever (only a payment/edit ever recomputes it —
  // see computeInstallmentStatus's call sites) even though it's genuinely
  // overdue now. A zero-paid installment's live classification is fully
  // determined by dueDate alone (paidAmount > 0 always means "partial",
  // never "overdue", at any point in the state machine), so this condition
  // catches both a row already correctly stored as "overdue" and one still
  // stuck at "pending" whose dueDate has since passed.
  const liveOverdue: Prisma.ScheduleInstallmentWhereInput = {
    status: { in: ["pending", "overdue"] },
    paidAmount: 0,
    dueDate: { lt: new Date() },
  };

  if (params.status === "active") {
    where.status = "active";
    where.installments = { none: { OR: [{ status: "partial" }, liveOverdue] } };
  } else if (params.status === "overdue") {
    where.installments = { some: liveOverdue };
  } else if (params.status === "partial") {
    where.installments = { some: { status: "partial" } };
  } else if (params.status === "completed") {
    where.status = "completed";
  }

  return db.studentFeeSchedule.findMany({
    where,
    include: {
      installments: true,
      enrollment: {
        include: {
          student: { select: { id: true, fullName: true, studentCode: true, phone: true } },
          batch:   { select: { id: true, name: true, center: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── Backfill admission payments for pre-existing students ─────────────────────

export async function backfillAdmissionPayments(db: PrismaClient): Promise<number> {
  const enrollments = await db.enrollment.findMany({
    where: {
      feeSchedule: { is: null },
      student: { amountPaid: { gt: 0 } },
    },
    include: {
      student: { select: { tenantId: true, amountPaid: true, paymentMode: true, createdAt: true } },
    },
  });

  for (const enrollment of enrollments) {
    const paid = Number(enrollment.student.amountPaid);
    if (paid <= 0) continue;

    const admissionDate = new Date(enrollment.student.createdAt);
    admissionDate.setHours(0, 0, 0, 0);

    const schedule = await db.studentFeeSchedule.create({
      data: {
        enrollmentId:   enrollment.id,
        totalFee:       paid,
        discountAmount: 0,
        effectiveFee:   paid,
        creditBalance:  0,
        status:         "completed",
        installments: {
          create: [{
            sortOrder:     0,
            label:         "Admission Payment",
            plannedAmount: paid,
            paidAmount:    paid,
            dueDate:       admissionDate,
            status:        "paid",
          }],
        },
      },
      include: { installments: true },
    });

    await db.paymentTransaction.create({
      data: {
        tenantId:      enrollment.student.tenantId,
        scheduleId:    schedule.id,
        installmentId: schedule.installments[0].id,
        amount:        paid,
        mode:          enrollment.student.paymentMode === "cash" ? "cash" : "upi",
        type:          "payment",
        receiptNo:     generateReceiptNo(),
        paidAt:        admissionDate,
        collectedById: null,
      },
    });
  }

  return enrollments.length;
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export async function getFeeSummary(db: PrismaClient, tenantId: string, centerIds: string[]) {
  const now = new Date();
  const som = new Date(now.getFullYear(), now.getMonth(), 1);

  const scopeFilter = { enrollment: { batch: { tenantId, centerId: { in: centerIds } } } };

  const [collectedThisMonth, schedulesForPending, overdueCount, activeSchedules] = await Promise.all([
    db.paymentTransaction.aggregate({
      where: { schedule: scopeFilter, type: "payment", paidAt: { gte: som } },
      _sum:  { amount: true },
    }),
    // Fetched per-schedule (not aggregated at the installment level) because
    // creditBalance lives on the schedule, not any one installment — see
    // computeScheduleOutstanding. Also sidesteps the stale-status problem
    // entirely: summing every schedule's live outstanding needs no status
    // filter, since a fully-settled schedule just nets to 0 regardless of
    // what its installments' stored status says.
    db.studentFeeSchedule.findMany({
      where:  scopeFilter,
      select: { effectiveFee: true, creditBalance: true, installments: { select: { paidAmount: true, waivedAmount: true } } },
    }),
    // Live, not the stored status — see listSchedules()'s liveOverdue comment.
    db.scheduleInstallment.count({
      where: { schedule: scopeFilter, status: { in: ["pending", "overdue"] }, paidAmount: 0, dueDate: { lt: now } },
    }),
    db.studentFeeSchedule.count({ where: { ...scopeFilter, status: "active" } }),
  ]);

  const pending = schedulesForPending.reduce(
    (sum, s) => sum + computeScheduleOutstanding(
      Number(s.effectiveFee), Number(s.creditBalance),
      s.installments.map((i) => ({ paidAmount: Number(i.paidAmount), waivedAmount: Number(i.waivedAmount) })),
    ),
    0,
  );

  return {
    collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
    pending,
    overdueCount,
    activeSchedules,
  };
}

// ── Collection dashboard (today/week/month/year totals + batch-wise) ─────────

export type CollectionPeriod = "today" | "week" | "month" | "year";

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Monday-start week — the ISO convention, not calendar-locale-dependent.
function startOfWeek(now: Date): Date {
  const day  = now.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day; // days back to the most recent Monday
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfYear(now: Date): Date {
  return new Date(now.getFullYear(), 0, 1);
}

function periodStart(period: CollectionPeriod, now: Date): Date {
  switch (period) {
    case "today": return startOfToday(now);
    case "week":  return startOfWeek(now);
    case "month": return startOfMonth(now);
    case "year":  return startOfYear(now);
  }
}

export async function getCollectionSummary(db: PrismaClient, tenantId: string, centerIds: string[]) {
  const now = new Date();
  const scopeFilter = { enrollment: { batch: { tenantId, centerId: { in: centerIds } } } };

  const [today, week, month, year, schedulesForPending, overdueCount] = await Promise.all([
    db.paymentTransaction.aggregate({ where: { schedule: scopeFilter, type: "payment", paidAt: { gte: startOfToday(now) } }, _sum: { amount: true } }),
    db.paymentTransaction.aggregate({ where: { schedule: scopeFilter, type: "payment", paidAt: { gte: startOfWeek(now) } },  _sum: { amount: true } }),
    db.paymentTransaction.aggregate({ where: { schedule: scopeFilter, type: "payment", paidAt: { gte: startOfMonth(now) } }, _sum: { amount: true } }),
    db.paymentTransaction.aggregate({ where: { schedule: scopeFilter, type: "payment", paidAt: { gte: startOfYear(now) } },  _sum: { amount: true } }),
    // See getFeeSummary's identical comment: per-schedule so creditBalance
    // is folded in correctly, sidestepping the stale-status problem too.
    db.studentFeeSchedule.findMany({
      where:  scopeFilter,
      select: { effectiveFee: true, creditBalance: true, installments: { select: { paidAmount: true, waivedAmount: true } } },
    }),
    // Live, not the stored status — see listSchedules()'s liveOverdue comment.
    db.scheduleInstallment.count({
      where: { schedule: scopeFilter, status: { in: ["pending", "overdue"] }, paidAmount: 0, dueDate: { lt: now } },
    }),
  ]);

  const totalPending = schedulesForPending.reduce(
    (sum, s) => sum + computeScheduleOutstanding(
      Number(s.effectiveFee), Number(s.creditBalance),
      s.installments.map((i) => ({ paidAmount: Number(i.paidAmount), waivedAmount: Number(i.waivedAmount) })),
    ),
    0,
  );

  return {
    collectedToday:     Number(today._sum.amount ?? 0),
    collectedThisWeek:  Number(week._sum.amount  ?? 0),
    collectedThisMonth: Number(month._sum.amount ?? 0),
    collectedThisYear:  Number(year._sum.amount  ?? 0),
    totalPending,
    overdueCount,
  };
}

// Per-batch collected (within the given period) + pending (live, current —
// pending has no time dimension the way collected does, so it's the same
// number regardless of which period is selected). Prisma can't groupBy
// across a relation, so this fetches the relevant rows once and reduces
// them in JS — fine at this institute's scale (see fees.service.ts's other
// client-side paid/pending arithmetic in listSchedules() for precedent).
export async function getCollectionByBatch(
  db:        PrismaClient,
  tenantId:  string,
  centerIds: string[],
  period:    CollectionPeriod,
) {
  const now   = new Date();
  const since = periodStart(period, now);

  const batches = await db.batch.findMany({
    where:   { tenantId, centerId: { in: centerIds } },
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const [payments, schedules] = await Promise.all([
    db.paymentTransaction.findMany({
      where: {
        type: "payment", paidAt: { gte: since },
        schedule: { enrollment: { batch: { tenantId, centerId: { in: centerIds } } } },
      },
      select: { amount: true, schedule: { select: { enrollment: { select: { batchId: true } } } } },
    }),
    // Per-schedule (not per-installment) so creditBalance is folded in
    // correctly — see computeScheduleOutstanding / getFeeSummary's identical
    // comment. Sidesteps the stale-status problem too: no status filter
    // needed, a fully-settled schedule just nets to 0.
    db.studentFeeSchedule.findMany({
      where: { enrollment: { batch: { tenantId, centerId: { in: centerIds } } } },
      select: {
        enrollmentId: true, effectiveFee: true, creditBalance: true,
        installments: { select: { paidAmount: true, waivedAmount: true } },
        enrollment: { select: { batchId: true } },
      },
    }),
  ]);

  const collectedByBatch = new Map<string, number>();
  for (const p of payments) {
    const batchId = p.schedule.enrollment.batchId;
    collectedByBatch.set(batchId, (collectedByBatch.get(batchId) ?? 0) + Number(p.amount));
  }

  const pendingByBatch = new Map<string, number>();
  const pendingStudentsByBatch = new Map<string, Set<string>>();
  for (const s of schedules) {
    const outstanding = computeScheduleOutstanding(
      Number(s.effectiveFee), Number(s.creditBalance),
      s.installments.map((i) => ({ paidAmount: Number(i.paidAmount), waivedAmount: Number(i.waivedAmount) })),
    );
    if (outstanding <= 0) continue;
    const batchId = s.enrollment.batchId;
    pendingByBatch.set(batchId, (pendingByBatch.get(batchId) ?? 0) + outstanding);
    const students = pendingStudentsByBatch.get(batchId) ?? new Set<string>();
    students.add(s.enrollmentId);
    pendingStudentsByBatch.set(batchId, students);
  }

  return {
    period,
    batches: batches.map((b) => ({
      batchId:             b.id,
      batchName:           b.name,
      collectedAmount:     collectedByBatch.get(b.id) ?? 0,
      pendingAmount:       pendingByBatch.get(b.id) ?? 0,
      pendingStudentCount: pendingStudentsByBatch.get(b.id)?.size ?? 0,
    })),
  };
}
