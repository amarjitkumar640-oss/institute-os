import { PrismaClient } from "@prisma/client";
import { JOB_REGISTRY, ensureJobConfig } from "./registry";
import { runJob } from "./runner";

const POLL_INTERVAL_MS = 30_000;

// Single tick: for every registered job, check whether it's due (enabled &&
// (never run before OR now - lastFinishedAt >= intervalMinutes)) and
// fire-and-forget runJob for each due job independently — one job's
// failure/slowness must not block another's check this tick. Reads
// JobConfig fresh every tick (not cached at startup), so an admin editing
// the interval takes effect on the very next tick without a restart.
async function tick(db: PrismaClient) {
  for (const def of JOB_REGISTRY) {
    const config = await ensureJobConfig(db, def);
    if (!config.isEnabled) continue;

    const lastRun = await db.jobRun.findFirst({
      where: { jobKey: def.key, status: { in: ["success", "failure"] } },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    });

    const isDue = lastRun?.finishedAt
      ? Date.now() - lastRun.finishedAt.getTime() >= config.intervalMinutes * 60_000
      : true; // never run before → due immediately

    if (isDue) {
      runJob(db, def, "scheduler").catch((err) => console.error(`[jobs] ${def.key} failed:`, err));
    }
  }
}

export function startJobScheduler(db: PrismaClient) {
  // Run once immediately (so a newly-deployed/restarted server doesn't wait
  // a full poll interval before catching up), then every 30s.
  tick(db).catch((err) => console.error("[jobs] scheduler tick error:", err));
  setInterval(() => tick(db).catch((err) => console.error("[jobs] scheduler tick error:", err)), POLL_INTERVAL_MS);
}
