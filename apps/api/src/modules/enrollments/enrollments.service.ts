import { Prisma, PrismaClient } from "@prisma/client";

export class BatchFullError extends Error {
  constructor() {
    super("Batch has reached capacity");
  }
}

export class AlreadyEnrolledError extends Error {
  constructor() {
    super("Student already enrolled in this batch");
  }
}

type Tx = PrismaClient | Prisma.TransactionClient;

export async function createEnrollment(
  tx: Tx,
  studentId: string,
  batchId: string,
  tenantId?: string,
) {
  const batch = tenantId
    ? await tx.batch.findFirstOrThrow({ where: { id: batchId, tenantId } })
    : await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
  const activeCount = await tx.enrollment.count({
    where: { batchId, status: "active" },
  });

  if (activeCount >= batch.capacity) {
    throw new BatchFullError();
  }

  // (studentId, batchId) is a hard unique constraint, so a student who was
  // previously dropped from this exact batch already has a row here — rejoin
  // reactivates it instead of inserting a duplicate that would hit P2002.
  const existing = await tx.enrollment.findUnique({
    where: { studentId_batchId: { studentId, batchId } },
  });
  if (existing) {
    if (existing.status === "active") throw new AlreadyEnrolledError();
    return tx.enrollment.update({
      where: { id: existing.id },
      data: { status: "active", enrolledOn: new Date() },
    });
  }

  return tx.enrollment.create({
    data: { studentId, batchId },
  });
}

// Soft status change only, never a delete — any StudentFeeSchedule/payments
// hanging off this enrollment stay exactly as they are, so fee history is
// never orphaned by removing someone from a batch.
export async function dropEnrollment(tx: Tx, enrollmentId: string) {
  return tx.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "dropped" },
  });
}

// Moves a student from their current batch to a different one in one
// transaction: the new enrollment is created (and capacity-checked) first,
// and the old one is only dropped after that succeeds — so a full target
// batch never leaves the student removed from their current batch with
// nowhere to land.
export async function transferEnrollment(
  tx: Tx,
  currentEnrollment: { id: string; studentId: string; batchId: string },
  toBatchId: string,
  tenantId: string,
) {
  const newEnrollment = await createEnrollment(tx, currentEnrollment.studentId, toBatchId, tenantId);
  await dropEnrollment(tx, currentEnrollment.id);
  return newEnrollment;
}
