import { Prisma, PrismaClient } from "@prisma/client";

export class BatchFullError extends Error {
  constructor() {
    super("Batch has reached capacity");
  }
}

type Tx = PrismaClient | Prisma.TransactionClient;

export async function createEnrollment(
  tx: Tx,
  studentId: string,
  batchId: string
) {
  const batch = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
  const activeCount = await tx.enrollment.count({
    where: { batchId, status: "active" },
  });

  if (activeCount >= batch.capacity) {
    throw new BatchFullError();
  }

  return tx.enrollment.create({
    data: { studentId, batchId },
  });
}
