import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { getSiteTenant } from "../site/site.service";
import * as govSources from "./gov-sources.service";

export const govSourcesAdminRouter = Router();

// Same tenant-gating convention as gov-exams-admin.routes.ts — this content
// is global, write access is still restricted to SITE_TENANT_SLUG's admins.
govSourcesAdminRouter.use(requireAuth, requireRole("admin"));
govSourcesAdminRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

const orgTypes = ["ssc", "banking", "railway", "other"] as const;
const contentTypes = ["recruitment", "current_affair"] as const;
// "search" is deprecated — replaced by the per-category prompt-template
// system (see gov-search-prompts.routes.ts). No existing GovSource rows
// use it; new/edited sources can no longer select it.
const fetchModes = ["url"] as const;
const scheduleFrequencies = ["hourly", "daily", "weekly", "monthly"] as const;

govSourcesAdminRouter.get("/", async (_req, res) => {
  res.json(await govSources.listSources());
});

const sourceSchema = z.object({
  category: z.enum(orgTypes),
  contentType: z.enum(contentTypes),
  fetchMode: z.enum(fetchModes),
  label: z.string().min(1).max(200),
  url: z.string().url().optional(),
  searchQuery: z.string().min(1).max(300).optional(),
  enabled: z.boolean().optional(),
  scheduleFrequency: z.enum(scheduleFrequencies).optional(),
  scheduleTimeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24-hour)").optional(),
  scheduleDayOfWeek: z.number().int().min(0).max(6).optional(),
  scheduleDayOfMonth: z.number().int().min(1).max(31).optional(),
});

govSourcesAdminRouter.post("/", validateBody(sourceSchema), async (req, res) => {
  const result = await govSources.createSource(req.body);
  if (!result.ok) return res.status(400).json({ error: result.invalid });
  res.status(201).json(result.source);
});

govSourcesAdminRouter.patch("/:id", validateUuidParam("id"), validateBody(sourceSchema.partial()), async (req, res) => {
  const result = await govSources.updateSource(req.params.id, req.body);
  if (!result.ok) {
    if ("invalid" in result) return res.status(400).json({ error: result.invalid });
    return res.status(404).json({ error: "Source not found" });
  }
  res.json(result.source);
});

govSourcesAdminRouter.delete("/:id", validateUuidParam("id"), async (req, res) => {
  const result = await govSources.deleteSource(req.params.id);
  if (!result.ok) return res.status(404).json({ error: "Source not found" });
  res.status(204).send();
});

govSourcesAdminRouter.post("/:id/run", validateUuidParam("id"), async (req, res) => {
  const source = await govSources.getSourceById(req.params.id);
  if (!source) return res.status(404).json({ error: "Source not found" });
  const outcome = await govSources.runSourceAndRecordStatus(source);
  if (outcome.skipped) return res.status(409).json({ error: "Already running" });
  res.json(outcome.result);
});
