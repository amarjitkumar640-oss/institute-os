import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { getSiteTenant } from "../site/site.service";
import { buildImportPlan, commitRecruitmentImport } from "./gov-exams-import.service";

export const govExamsImportRouter = Router();

// Same tenant-gating convention as the other gov-exams admin routers.
govExamsImportRouter.use(requireAuth, requireRole("admin"));
govExamsImportRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

const orgTypes = ["ssc", "banking", "railway", "other"] as const;

// `vacancies` items are deliberately untyped records here — see
// import-mapper.ts's RawImportItem comment for why this is validated
// defensively at read-time instead of with a strict per-field schema.
const importRequestSchema = z.object({
  category: z.enum(orgTypes),
  vacancies: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
});

// Preview never writes to the DB — it runs the exact same mapping,
// organization matching, and validation the commit step will, so what the
// admin sees here is what they'll get.
govExamsImportRouter.post("/recruitments/preview", validateBody(importRequestSchema), async (req, res) => {
  const items = await buildImportPlan(req.body.vacancies, req.body.category);
  res.json({ items });
});

govExamsImportRouter.post("/recruitments/commit", validateBody(importRequestSchema), async (req, res) => {
  const result = await commitRecruitmentImport(req.body.vacancies, req.body.category);
  res.json(result);
});
