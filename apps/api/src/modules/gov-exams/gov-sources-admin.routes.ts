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

govSourcesAdminRouter.get("/", async (_req, res) => {
  res.json(await govSources.listSources());
});

const sourceSchema = z.object({
  category: z.enum(orgTypes),
  contentType: z.enum(contentTypes),
  organizationId: z.string().uuid().optional(),
  label: z.string().min(1).max(200),
  url: z.string().url(),
  enabled: z.boolean().optional(),
});

govSourcesAdminRouter.post("/", validateBody(sourceSchema), async (req, res) => {
  const result = await govSources.createSource(req.body);
  if (!result.ok) return res.status(404).json({ error: "Organization not found" });
  res.status(201).json(result.source);
});

govSourcesAdminRouter.patch("/:id", validateUuidParam("id"), validateBody(sourceSchema.partial()), async (req, res) => {
  const result = await govSources.updateSource(req.params.id, req.body);
  if (!result.ok) return res.status(404).json({ error: "Source or organization not found" });
  res.json(result.source);
});

govSourcesAdminRouter.delete("/:id", validateUuidParam("id"), async (req, res) => {
  const result = await govSources.deleteSource(req.params.id);
  if (!result.ok) return res.status(404).json({ error: "Source not found" });
  res.status(204).send();
});
