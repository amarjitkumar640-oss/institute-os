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
  input:    UpsertFeeTemplateInput,
) {
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

export async function getFeeTemplate(db: PrismaClient, courseId: string) {
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
) {
  const existing = await db.studentFeeSchedule.findUnique({ where: { enrollmentId } });
  if (existing) throw new Error("SCHEDULE_ALREADY_EXISTS");

  const enrollment = await db.enrollment.findUnique({
    where:   { id: enrollmentId },
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
  input:      { discountAmount: number; discountReason?: string },
) {
  const schedule = await db.studentFeeSchedule.findUnique({
    where: { id: scheduleId },
    include: { installments: { orderBy: { sortOrder: "asc" } } },
  });
  if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");

  const effectiveFee = Number(schedule.totalFee) - input.discountAmount;
  if (effectiveFee < 0) throw new Error("DISCOUNT_EXCEEDS_FEE");

  return db.studentFeeSchedule.update({
    where: { id: scheduleId },
    data:  {
      discountAmount: input.discountAmount,
      discountReason: input.discountReason ?? null,
      effectiveFee,
    },
    include: { installments: { orderBy: { sortOrder: "asc" } } },
  });
}

// ── Edit a single installment ─────────────────────────────────────────────────

export async function editInstallment(
  db:            PrismaClient,
  installmentId: string,
  input:         EditInstallmentInput,
) {
  const inst = await db.scheduleInstallment.findUnique({ where: { id: installmentId } });
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
  db:      PrismaClient,
  staffId: string | null,
  input:   RecordPaymentInput,
) {
  return db.$transaction(async (tx) => {
    const schedule = await tx.studentFeeSchedule.findUnique({
      where:   { id: input.scheduleId },
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

export async function getScheduleDetail(db: PrismaClient, enrollmentId: string) {
  return db.studentFeeSchedule.findUnique({
    where:   { enrollmentId },
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
}

// ── List schedules with summary counts ───────────────────────────────────────

export async function listSchedules(
  db:       PrismaClient,
  centerId: string | null | undefined,
  params:   { search?: string; status?: string; batchId?: string },
) {
  const where: Prisma.StudentFeeScheduleWhereInput = {
    enrollment: {
      batch: centerId ? { centerId } : undefined,
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

  if (params.status === "active") {
    where.status = "active";
    where.installments = { none: { status: { in: ["overdue", "partial"] } } };
  } else if (params.status === "overdue") {
    where.installments = { some: { status: "overdue" } };
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
          batch:   { select: { id: true, name: true } },
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
      student: { select: { amountPaid: true, paymentMode: true, createdAt: true } },
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

export async function getFeeSummary(db: PrismaClient, centerId?: string | null) {
  const now = new Date();
  const som = new Date(now.getFullYear(), now.getMonth(), 1);

  const centerFilter = centerId
    ? { enrollment: { batch: { centerId } } }
    : {};

  const [collectedThisMonth, outstandingAgg, overdueCount, activeSchedules] = await Promise.all([
    db.paymentTransaction.aggregate({
      where: { schedule: centerFilter, type: "payment", paidAt: { gte: som } },
      _sum:  { amount: true },
    }),
    db.scheduleInstallment.aggregate({
      where: { schedule: centerFilter, status: { in: ["pending", "partial", "overdue"] } },
      _sum:  { plannedAmount: true, paidAmount: true, waivedAmount: true },
    }),
    db.scheduleInstallment.count({ where: { schedule: centerFilter, status: "overdue" } }),
    db.studentFeeSchedule.count({ where: { ...centerFilter, status: "active" } }),
  ]);

  const pending =
    Number(outstandingAgg._sum.plannedAmount ?? 0) -
    Number(outstandingAgg._sum.paidAmount    ?? 0) -
    Number(outstandingAgg._sum.waivedAmount  ?? 0);

  return {
    collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
    pending:            Math.max(0, pending),
    overdueCount,
    activeSchedules,
  };
}
