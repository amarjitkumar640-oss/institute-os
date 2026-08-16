import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { JOB_REGISTRY, getJobDefinition, ensureJobConfig } from "./registry";
import { runJob } from "./runner";

export const jobsRouter = Router();

const RUN_HISTORY_LIMIT = 5;

// GET / — every known job (registry) merged with its DB config + recent runs.
jobsRouter.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const jobs = await Promise.all(JOB_REGISTRY.map(async (def) => {
    const config = await ensureJobConfig(prisma, def);
    const runs = await prisma.jobRun.findMany({
      where: { jobKey: def.key },
      orderBy: { startedAt: "desc" },
      take: RUN_HISTORY_LIMIT,
    });
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      intervalMinutes: config.intervalMinutes,
      isEnabled: config.isEnabled,
      lastRun: runs[0] ?? null,
      recentRuns: runs,
    };
  }));
  res.json(jobs);
});

// POST /:key/run — manual trigger, same runJob() the scheduler uses.
jobsRouter.post("/:key/run", requireAuth, requireRole("admin"), async (req, res) => {
  const def = getJobDefinition(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown job" });

  try {
    const outcome = await runJob(prisma, def, "manual", req.auth!.staffId);
    if (outcome.skipped) return res.status(409).json({ error: "Job is already running" });
    res.json({ run: outcome.run, result: outcome.result });
  } catch (err: any) {
    // runJob already recorded the failure row — surface it to the caller too
    // so "Run Now" gets an immediate error, not just a stale table row.
    res.status(500).json({ error: err?.message ?? "Job failed" });
  }
});

const patchSchema = z.object({
  intervalMinutes: z.number().int().positive().max(1440).optional(),
  isEnabled: z.boolean().optional(),
});

// PATCH /:key — update intervalMinutes and/or isEnabled.
jobsRouter.patch("/:key", requireAuth, requireRole("admin"), validateBody(patchSchema), async (req, res) => {
  const def = getJobDefinition(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown job" });

  await ensureJobConfig(prisma, def);
  const updated = await prisma.jobConfig.update({
    where: { key: def.key },
    data: req.body,
  });
  res.json(updated);
});
