import { PrismaClient, BatchStatus } from "@prisma/client";

// What a brand-new batch's status should start at, given its own dates — for
// a batch backfilled with a startDate already in the past (or even an
// endDate already in the past), so it doesn't sit at the schema's "upcoming"
// default until the next sweep tick happens to catch it. Deliberately a
// separate function from the sweep below, not a shared "recompute status"
// used by both: the sweep only ever promotes forward from whatever's
// currently stored (never overriding a manual "completed" set early), which
// only makes sense for a batch that already has a real status to compare
// against. A batch that doesn't exist yet has no such history to respect.
export function computeInitialBatchStatus(startDate: Date, endDate: Date, now = new Date()): BatchStatus {
  if (endDate < now) return "completed";
  if (startDate <= now) return "running";
  return "upcoming";
}

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
