import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { getSiteTenant } from "../site/site.service";
import * as aiSettings from "./ai-settings.service";

export const aiSettingsRouter = Router();

// Platform-wide config (no tenantId on the underlying tables) — same
// admin+tenant gate as every gov-exams admin router, the established
// precedent for platform-sensitive screens in this app.
aiSettingsRouter.use(requireAuth, requireRole("admin"));
aiSettingsRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

const PROVIDER_TYPES = ["openai", "groq", "anthropic", "google"] as const;
const PURPOSES = ["chat", "reasoning", "websearch", "embedding"] as const;

aiSettingsRouter.get("/providers", async (_req, res) => {
  res.json(await aiSettings.getProviderStatus());
});

aiSettingsRouter.get("/providers/:provider/models", async (req, res) => {
  const provider = req.params.provider;
  if (!PROVIDER_TYPES.includes(provider as (typeof PROVIDER_TYPES)[number])) {
    return res.status(400).json({ error: `Unknown provider "${provider}"` });
  }
  const result = await aiSettings.listProviderModels(provider as (typeof PROVIDER_TYPES)[number]);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.models);
});

aiSettingsRouter.get("/catalog", async (_req, res) => {
  res.json(await aiSettings.listCatalog());
});

const catalogSchema = z.object({
  provider: z.enum(PROVIDER_TYPES),
  modelId: z.string().min(1),
  label: z.string().min(1),
  fallbackProvider: z.enum(PROVIDER_TYPES).optional(),
  fallbackModelId: z.string().min(1).optional(),
});

aiSettingsRouter.post("/catalog", validateBody(catalogSchema), async (req, res) => {
  try {
    res.status(201).json(await aiSettings.createCatalogEntry(req.body));
  } catch {
    res.status(409).json({ error: "A catalog entry for this provider+model already exists" });
  }
});

const catalogPatchSchema = catalogSchema.partial().extend({ enabled: z.boolean().optional() });

aiSettingsRouter.patch("/catalog/:id", validateUuidParam("id"), validateBody(catalogPatchSchema), async (req, res) => {
  try {
    res.json(await aiSettings.updateCatalogEntry(req.params.id, req.body));
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

aiSettingsRouter.delete("/catalog/:id", validateUuidParam("id"), async (req, res) => {
  const result = await aiSettings.deleteCatalogEntry(req.params.id);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.status(204).send();
});

aiSettingsRouter.get("/assignments", async (_req, res) => {
  res.json(await aiSettings.listAssignments());
});

const assignmentSchema = z.object({ modelEntryId: z.string().uuid() });

aiSettingsRouter.put("/assignments/:purpose", validateBody(assignmentSchema), async (req, res) => {
  const purpose = req.params.purpose;
  if (!PURPOSES.includes(purpose as (typeof PURPOSES)[number])) {
    return res.status(400).json({ error: `Unknown purpose "${purpose}"` });
  }
  const result = await aiSettings.setAssignment(purpose as (typeof PURPOSES)[number], req.body.modelEntryId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.assignment);
});
