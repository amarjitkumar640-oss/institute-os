import { PrismaClient, JobRun } from "@prisma/client";
import { JobDefinition, JobTrigger, ensureJobConfig } from "./registry";

// Single-process concurrency guard — if this API is ever run as more than one
// Node process/instance sharing one DB, two processes could still run the
// same job concurrently. Acceptable for now (same class of tradeoff as the
// admin-role access-scope decision for this feature), flagged here so it
// isn't silently relied on if the deployment topology changes.
const runningKeys = new Set<string>();

type RunOutcome =
  | { skipped: true; reason: string }
  | { skipped: false; run: JobRun; result: Record<string, number | string> };

// The only place that ever writes a JobRun row — both the scheduler tick and
// the manual "Run Now" route call this, so there's exactly one code path that
// can produce inconsistent bookkeeping, not two.
export async function runJob(
  db: PrismaClient,
  def: JobDefinition,
  trigger: JobTrigger,
  triggeredById?: string,
): Promise<RunOutcome> {
  if (runningKeys.has(def.key)) {
    return { skipped: true, reason: "already running" };
  }
  runningKeys.add(def.key);

  try {
    // JobRun.jobKey is an FK to JobConfig.key — guarantee the row exists
    // (idempotent no-op once it does) so a job that's never been ticked by
    // the scheduler yet can still be run manually without a FK violation.
    await ensureJobConfig(db, def);

    const run = await db.jobRun.create({
      data: { jobKey: def.key, status: "running", trigger, triggeredById: triggeredById ?? null },
    });

    try {
      const result = await def.run(db);
      const updated = await db.jobRun.update({
        where: { id: run.id },
        data: { status: "success", finishedAt: new Date(), resultSummary: result },
      });
      return { skipped: false, run: updated, result };
    } catch (err: any) {
      await db.jobRun.update({
        where: { id: run.id },
        data: { status: "failure", finishedAt: new Date(), errorMessage: String(err?.message ?? err) },
      });
      throw err; // caller (scheduler tick / route handler) decides how to surface it
    }
  } finally {
    // Must run even if ensureJobConfig/jobRun.create itself throws before we
    // ever reach def.run() — otherwise a failure that early would leave this
    // key permanently stuck as "running" until the process restarts.
    runningKeys.delete(def.key);
  }
}
