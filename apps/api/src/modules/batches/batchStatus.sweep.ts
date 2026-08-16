import { PrismaClient } from "@prisma/client";

// Batch.status is otherwise only changed by hand (EditBatchScreen's status
// picker) — a batch created with a future startDate just sits at "upcoming"
// forever unless someone remembers to flip it once it actually begins. This
// sweep keeps it in sync with the calendar instead: promotes "upcoming" →
// "running" once startDate has arrived, and "running" → "completed" once
// endDate has passed. A manual override still works fine in between sweeps —
// this only touches batches whose stored status has fallen behind their
// dates, never one already correctly set to something the dates disagree
// with in the other direction (e.g. a batch marked "completed" early).
export async function runBatchStatusSweep(db: PrismaClient) {
  const now = new Date();

  const started = await db.batch.updateMany({
    where: { status: "upcoming", startDate: { lte: now } },
    data: { status: "running" },
  });

  const completed = await db.batch.updateMany({
    where: { status: "running", endDate: { lt: now } },
    data: { status: "completed" },
  });

  return { startedCount: started.count, completedCount: completed.count };
}
