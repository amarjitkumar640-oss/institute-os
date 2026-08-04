import { PrismaClient } from "@prisma/client";
import { notify, notifyByRole } from "./notification.service";

// "HH:MM" + minutes → "HH:MM", wrapping at midnight. Doesn't handle the
// reminder window itself spanning midnight (e.g. now=23:55, +15min) — an
// acceptable gap for a coaching-institute class schedule that's never
// realistically run right at midnight.
function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Notifies a teacher when one of their sessions starts within the tenant's
// configured reminder window. Runs once per sweep tick; reminderSentAt
// guards against re-notifying on the next tick for the same session.
export async function runClassReminderSweep(db: PrismaClient) {
  const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true, classReminderMinutes: true } });
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowHHMM = now.toTimeString().slice(0, 5);

  for (const tenant of tenants) {
    const windowEnd = addMinutesToTime(nowHHMM, tenant.classReminderMinutes);

    const sessions = await db.classSession.findMany({
      where: {
        status: "scheduled",
        reminderSentAt: null,
        scheduledDate: new Date(`${todayStr}T00:00:00.000Z`),
        startTime: { gte: nowHHMM, lte: windowEnd },
        batch: { tenantId: tenant.id },
      },
      select: {
        id: true,
        startTime: true,
        subject: { select: { name: true } },
        batch: { select: { id: true, name: true } },
        faculty: { select: { staffId: true } },
      },
    });

    for (const session of sessions) {
      if (session.faculty?.staffId) {
        await notify(
          db, session.faculty.staffId, tenant.id, "class_reminder",
          "Class starting soon",
          `${session.subject?.name ?? "Class"} — ${session.batch.name} starts at ${session.startTime}`,
          { screen: "BatchSchedule", batchId: session.batch.id, batchName: session.batch.name },
        );
      }
      await db.classSession.update({ where: { id: session.id }, data: { reminderSentAt: now } });
    }
  }
}

// Notifies the configured routing roles about installments that are overdue
// past the tenant's grace period. "Overdue" is computed live against dueDate
// here — never trust the stored ScheduleInstallment.status column for this,
// it's only recomputed when a payment is recorded or the installment is
// edited (see fees.service.ts's computeInstallmentStatus), so it goes stale.
export async function runOverdueInstallmentSweep(db: PrismaClient) {
  const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true, overdueGraceDays: true } });
  const now = new Date();

  for (const tenant of tenants) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - tenant.overdueGraceDays);

    const installments = await db.scheduleInstallment.findMany({
      where: {
        status: { in: ["pending", "partial"] },
        dueDate: { lt: cutoff },
        overdueNotifiedAt: null,
        schedule: { enrollment: { batch: { tenantId: tenant.id } } },
      },
      select: {
        id: true,
        plannedAmount: true,
        schedule: {
          select: {
            enrollmentId: true,
            enrollment: {
              select: {
                student: { select: { fullName: true } },
                batch:   { select: { centerId: true } },
              },
            },
          },
        },
      },
    });

    for (const inst of installments) {
      const studentName = inst.schedule.enrollment.student.fullName;
      await notifyByRole(
        db, tenant.id, "installment_overdue",
        "Installment overdue",
        `${studentName}'s installment of ₹${inst.plannedAmount} is overdue`,
        { screen: "FeeScheduleDetail", enrollmentId: inst.schedule.enrollmentId, studentName },
        inst.schedule.enrollment.batch.centerId,
      );
      await db.scheduleInstallment.update({ where: { id: inst.id }, data: { overdueNotifiedAt: now } });
    }
  }
}

export async function runNotificationSweeps(db: PrismaClient) {
  await runClassReminderSweep(db);
  await runOverdueInstallmentSweep(db);
}
