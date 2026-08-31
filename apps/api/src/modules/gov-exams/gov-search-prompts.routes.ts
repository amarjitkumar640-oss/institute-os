import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { getSiteTenant } from "../site/site.service";
import * as govSearchPrompts from "./gov-search-prompts.service";

export const govSearchPromptsRouter = Router();

// Same tenant-gating convention as gov-sources-admin.routes.ts — this
// content is global, write access is still restricted to
// SITE_TENANT_SLUG's admins.
govSearchPromptsRouter.use(requireAuth, requireRole("admin"));
govSearchPromptsRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

const orgTypes = ["ssc", "banking", "railway", "other"] as const;
const scheduleFrequencies = ["hourly", "daily", "weekly", "monthly"] as const;

const promptTemplateSchema = z.object({
  prompt: z.string().min(1),
  enabled: z.boolean().optional(),
  scheduleFrequency: z.enum(scheduleFrequencies).optional(),
  scheduleTimeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24-hour)").optional(),
  scheduleDayOfWeek: z.number().int().min(0).max(6).optional(),
  scheduleDayOfMonth: z.number().int().min(1).max(31).optional(),
});

govSearchPromptsRouter.get("/job-vacancy-prompts", async (_req, res) => {
  res.json(await govSearchPrompts.listJobVacancyPromptTemplates());
});

govSearchPromptsRouter.get("/job-vacancy-prompts/:category", async (req, res) => {
  const parsed = z.enum(orgTypes).safeParse(req.params.category);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  const template = await govSearchPrompts.getJobVacancyPromptTemplate(parsed.data);
  if (!template) return res.status(404).json({ error: "Not configured yet" });
  res.json(template);
});

govSearchPromptsRouter.put(
  "/job-vacancy-prompts/:category",
  validateBody(promptTemplateSchema),
  async (req, res) => {
    const parsed = z.enum(orgTypes).safeParse(req.params.category);
    if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
    const result = await govSearchPrompts.upsertJobVacancyPromptTemplate(parsed.data, req.body);
    if (!result.ok) return res.status(400).json({ error: result.invalid });
    res.json(result.template);
  },
);

govSearchPromptsRouter.delete("/job-vacancy-prompts/:category", async (req, res) => {
  const parsed = z.enum(orgTypes).safeParse(req.params.category);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  const result = await govSearchPrompts.deleteJobVacancyPromptTemplate(parsed.data);
  if (!result.ok) return res.status(404).json({ error: "Not configured" });
  res.status(204).send();
});

// ?useCachedSearch=true replays the last cached search answer instead of
// paying for and waiting on a new one — for retrying an extraction-side fix
// (schema/mapper bug) against a real prior search. See
// GovJobVacancyPromptTemplate.lastSearchContent.
govSearchPromptsRouter.post("/job-vacancy-prompts/:category/run", async (req, res) => {
  const parsed = z.enum(orgTypes).safeParse(req.params.category);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  const useCachedSearch = req.query.useCachedSearch === "true";
  const outcome = await govSearchPrompts.runJobVacancyPromptTemplateNow(parsed.data, { useCachedSearch });
  if (!outcome.ok) return res.status(404).json({ error: "Not configured" });
  if (outcome.result.skipped) return res.status(409).json({ error: "Already running" });
  res.json(outcome.result.result);
});

govSearchPromptsRouter.get("/current-affairs-prompt", async (_req, res) => {
  const template = await govSearchPrompts.getCurrentAffairsPromptTemplate();
  if (!template) return res.status(404).json({ error: "Not configured yet" });
  res.json(template);
});

govSearchPromptsRouter.put(
  "/current-affairs-prompt",
  validateBody(promptTemplateSchema),
  async (req, res) => {
    const result = await govSearchPrompts.upsertCurrentAffairsPromptTemplate(req.body);
    if (!result.ok) return res.status(400).json({ error: result.invalid });
    res.json(result.template);
  },
);

govSearchPromptsRouter.delete("/current-affairs-prompt", async (_req, res) => {
  const result = await govSearchPrompts.deleteCurrentAffairsPromptTemplate();
  if (!result.ok) return res.status(404).json({ error: "Not configured" });
  res.status(204).send();
});

govSearchPromptsRouter.post("/current-affairs-prompt/run", async (req, res) => {
  const useCachedSearch = req.query.useCachedSearch === "true";
  const outcome = await govSearchPrompts.runCurrentAffairsPromptTemplateNow({ useCachedSearch });
  if (!outcome.ok) return res.status(404).json({ error: "Not configured" });
  if (outcome.result.skipped) return res.status(409).json({ error: "Already running" });
  res.json(outcome.result.result);
});
