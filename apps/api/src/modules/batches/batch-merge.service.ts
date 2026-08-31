import { Prisma, PrismaClient } from "@prisma/client";
import { notifyByRole } from "../notifications/notification.service";

export class BatchNotFoundError extends Error {
  constructor() { super("Batch not found"); }
}
export class SameBatchError extends Error {
  constructor() { super("Source and target batch are the same"); }
}
export class EmptySourceBatchError extends Error {
  constructor() { super("This batch has no active students to merge"); }
}

export interface MergeSkip {
  studentId: string;
  fullName:  string;
  reason:    string;
}

export interface MergeResult {
  mergedCount:       number;
  skipped:           MergeSkip[];
  sourceBatchStatus: "merged" | null; // null when the source batch still has students left behind (skips)
}

// Merges every active enrollment of `fromBatchId` into `toBatchId` — no
// course-match requirement (deliberately: a student's own courseId and
// fee schedule are untouched either way, so this is safe even across
// different courses). Each student is moved by updating their *existing*
// Enrollment row's batchId in place, never dropping it and creating a new
// one — that's what keeps StudentFeeSchedule (which points at the
// enrollment, not the batch) correctly attached with zero extra work,
// unlike the drop+recreate shape of transferEnrollment(). enrolledOn is
// untouched too, so a merged student's tenure doesn't look like it
// restarted today.
export async function mergeBatch(
  db:          PrismaClient,
  tenantId:    string,
  fromBatchId: string,
  toBatchId:   string,
): Promise<MergeResult> {
  if (fromBatchId === toBatchId) throw new SameBatchError();

  const [fromBatch, toBatch] = await Promise.all([
    db.batch.findFirst({ where: { id: fromBatchId, tenantId } }),
    db.batch.findFirst({ where: { id: toBatchId, tenantId } }),
  ]);
  if (!fromBatch || !toBatch) throw new BatchNotFoundError();

  const activeEnrollments = await db.enrollment.findMany({
    where:   { batchId: fromBatchId, status: "active" },
    include: { student: { select: { id: true, fullName: true } } },
  });
  if (activeEnrollments.length === 0) throw new EmptySourceBatchError();

  const skipped: MergeSkip[] = [];
  let mergedCount = 0;

  // One transaction per student, same shape as legacy-import.service.ts's
  // importLegacyStudent() — one bad row (already in the target, target
  // full) is reported and skipped rather than failing the whole merge.
  for (const enrollment of activeEnrollments) {
    try {
      await db.$transaction(
        async (tx) => {
          const existing = await tx.enrollment.findUnique({
            where: { studentId_batchId: { studentId: enrollment.studentId, batchId: toBatchId } },
          });
          if (existing) throw new Error("ALREADY_IN_TARGET");

          const activeCount = await tx.enrollment.count({ where: { batchId: toBatchId, status: "active" } });
          if (activeCount >= toBatch.capacity) throw new Error("TARGET_FULL");

          await tx.enrollment.update({ where: { id: enrollment.id }, data: { batchId: toBatchId } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      mergedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const reason =
        message === "ALREADY_IN_TARGET" ? "Already has a record in the target batch — needs manual handling" :
        message === "TARGET_FULL"       ? "Target batch is full" :
        "Something went wrong";
      skipped.push({ studentId: enrollment.studentId, fullName: enrollment.student.fullName, reason });
    }
  }

  let sourceBatchStatus: "merged" | null = null;
  if (mergedCount > 0) {
    const remainingActive = await db.enrollment.count({ where: { batchId: fromBatchId, status: "active" } });
    if (remainingActive === 0) {
      // Stop the emptied batch from generating any more (empty) future
      // sessions. It can't be deleted (batches.routes.ts blocks deletion
      // once any enrollment has ever existed), so `merged` status is how
      // it's told apart from a batch that actually finished its course.
      await db.classSlot.updateMany({
        where: { batchId: fromBatchId, isActive: true },
        data:  { isActive: false, validTo: new Date() },
      });
      await db.batch.update({ where: { id: fromBatchId }, data: { status: "merged" } });
      sourceBatchStatus = "merged";
    }

    // One summary notification, not one per merged student.
    await notifyByRole(
      db, tenantId, "new_enrollment",
      "Batches merged",
      `${mergedCount} student(s) merged from ${fromBatch.name} into ${toBatch.name}`,
      { screen: "StudentList", batchId: toBatchId, batchName: toBatch.name },
      toBatch.centerId,
    ).catch(console.error);
  }

  return { mergedCount, skipped, sourceBatchStatus };
}
