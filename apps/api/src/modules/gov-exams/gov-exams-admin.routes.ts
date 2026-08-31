import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { getSiteTenant } from "../site/site.service";
import * as govExams from "./gov-exams.service";
import * as categories from "./current-affair-categories.service";

export const govExamsAdminRouter = Router();

// This content is global (no tenantId — see prisma schema comment), but
// write access is still restricted to SITE_TENANT_SLUG's own admins for
// now, same convention as site-admin.routes.ts, since only that tenant's
// portal displays it today.
govExamsAdminRouter.use(requireAuth, requireRole("admin"));
govExamsAdminRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

const orgTypes = ["ssc", "banking", "railway", "other"] as const;
const docTypes = ["admit_card", "result", "answer_key", "notification", "syllabus"] as const;
const categoryPriorities = ["primary", "secondary"] as const;
const recruitmentStatuses = ["draft", "published", "archived"] as const;
const contentSources = ["manual", "scraped"] as const;

// ── Recruitments ─────────────────────────────────────────────────────────────

const listRecruitmentsQuery = z.object({
  category: z.enum(orgTypes).optional(),
  status: z.enum(recruitmentStatuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

govExamsAdminRouter.get("/recruitments", async (req, res) => {
  const parsed = listRecruitmentsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await govExams.listRecruitments(parsed.data);
  res.json(result);
});

govExamsAdminRouter.get("/recruitments/:id", validateUuidParam("id"), async (req, res) => {
  const recruitment = await govExams.getRecruitmentById(req.params.id);
  if (!recruitment) return res.status(404).json({ error: "Not found" });
  res.json(recruitment);
});

const postSchema = z.object({
  name: z.string().min(1),
  vacancyCount: z.number().int().nonnegative().optional(),
  payScale: z.string().optional(),
});

const recruitmentSchema = z.object({
  category: z.enum(orgTypes),
  organization: z.string().max(200).optional(),
  title: z.string().min(1).max(300),
  slug: z.string().min(1).max(300).regex(/^[a-z0-9-]+$/, "slug must be lowercase-with-hyphens"),
  totalVacancies: z.number().int().nonnegative().optional(),
  qualification: z.string().max(500).optional(),
  ageMin: z.number().int().nonnegative().optional(),
  ageMax: z.number().int().nonnegative().optional(),
  categoryRelaxations: z.record(z.string(), z.number()).optional(),
  applicationFee: z.record(z.string(), z.number()).optional(),
  posts: z.array(postSchema).optional(),
  applicationStartDate: z.coerce.date().optional(),
  applicationEndDate: z.coerce.date().optional(),
  examDate: z.coerce.date().optional(),
  officialNotificationUrl: z.string().url().optional(),
  officialWebsiteUrl: z.string().url().optional(),
  source: z.enum(contentSources).optional(),
  sourceUrl: z.string().url().optional(),
});

govExamsAdminRouter.post("/recruitments", validateBody(recruitmentSchema), async (req, res) => {
  const result = await govExams.createRecruitment(req.body);
  if (!result.ok) return res.status(409).json({ error: "A recruitment with this slug already exists" });
  res.status(201).json(result.recruitment);
});

govExamsAdminRouter.patch(
  "/recruitments/:id",
  validateUuidParam("id"),
  validateBody(recruitmentSchema.partial()),
  async (req, res) => {
    const result = await govExams.updateRecruitment(req.params.id, req.body);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Recruitment not found" });
      return res.status(409).json({ error: "A recruitment with this slug already exists" });
    }
    res.json(result.recruitment);
  },
);

const statusSchema = z.object({ status: z.enum(recruitmentStatuses) });

govExamsAdminRouter.patch(
  "/recruitments/:id/status",
  validateUuidParam("id"),
  validateBody(statusSchema),
  async (req, res) => {
    const result = await govExams.setRecruitmentStatus(req.params.id, req.body.status);
    if (!result.ok) return res.status(404).json({ error: "Recruitment not found" });
    res.json(result.recruitment);
  },
);

govExamsAdminRouter.delete("/recruitments/:id", validateUuidParam("id"), async (req, res) => {
  const result = await govExams.deleteRecruitment(req.params.id);
  if (!result.ok) return res.status(404).json({ error: "Recruitment not found" });
  res.status(204).send();
});

// ── Documents ─────────────────────────────────────────────────────────────────

const documentSchema = z.object({
  recruitmentId: z.string().uuid(),
  type: z.enum(docTypes),
  title: z.string().min(1).max(300),
  releaseDate: z.coerce.date().optional(),
  documentUrl: z.string().url().optional(),
  source: z.enum(contentSources).optional(),
});

govExamsAdminRouter.post("/documents", validateBody(documentSchema), async (req, res) => {
  const result = await govExams.createDocument(req.body);
  if (!result.ok) return res.status(404).json({ error: "Recruitment not found" });
  res.status(201).json(result.document);
});

govExamsAdminRouter.delete("/documents/:id", validateUuidParam("id"), async (req, res) => {
  const result = await govExams.deleteDocument(req.params.id);
  if (!result.ok) return res.status(404).json({ error: "Document not found" });
  res.status(204).send();
});

// ── Current affairs ──────────────────────────────────────────────────────────

const listCurrentAffairsQuery = z.object({
  categoryId: z.string().uuid().optional(),
  status: z.enum(recruitmentStatuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

govExamsAdminRouter.get("/current-affairs", async (req, res) => {
  const parsed = listCurrentAffairsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await govExams.listCurrentAffairs(parsed.data);
  res.json(result);
});

govExamsAdminRouter.get("/current-affairs/:id", validateUuidParam("id"), async (req, res) => {
  const currentAffair = await govExams.getCurrentAffairById(req.params.id);
  if (!currentAffair) return res.status(404).json({ error: "Not found" });
  res.json(currentAffair);
});

const currentAffairSchema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().min(1).max(300).regex(/^[a-z0-9-]+$/, "slug must be lowercase-with-hyphens"),
  categoryId: z.string().uuid(),
  whatHappened: z.string().min(1),
  keyFacts: z.array(z.string()).optional(),
  whyImportant: z.string().optional(),
  examRelevance: z.record(z.string(), z.string()).optional(),
  publishedDate: z.coerce.date(),
  source: z.enum(contentSources).optional(),
  sourceUrl: z.string().url().optional(),
});

govExamsAdminRouter.post("/current-affairs", validateBody(currentAffairSchema), async (req, res) => {
  const result = await govExams.createCurrentAffair(req.body);
  if (!result.ok) return res.status(409).json({ error: "A current affair with this slug already exists" });
  res.status(201).json(result.currentAffair);
});

govExamsAdminRouter.patch(
  "/current-affairs/:id",
  validateUuidParam("id"),
  validateBody(currentAffairSchema.partial()),
  async (req, res) => {
    const result = await govExams.updateCurrentAffair(req.params.id, req.body);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Current affair not found" });
      return res.status(409).json({ error: "A current affair with this slug already exists" });
    }
    res.json(result.currentAffair);
  },
);

govExamsAdminRouter.patch(
  "/current-affairs/:id/status",
  validateUuidParam("id"),
  validateBody(statusSchema),
  async (req, res) => {
    const result = await govExams.setCurrentAffairStatus(req.params.id, req.body.status);
    if (!result.ok) return res.status(404).json({ error: "Current affair not found" });
    res.json(result.currentAffair);
  },
);

govExamsAdminRouter.delete("/current-affairs/:id", validateUuidParam("id"), async (req, res) => {
  const result = await govExams.deleteCurrentAffair(req.params.id);
  if (!result.ok) return res.status(404).json({ error: "Current affair not found" });
  res.status(204).send();
});

// ── Current affair categories ────────────────────────────────────────────────

govExamsAdminRouter.get("/current-affair-categories", async (_req, res) => {
  res.json(await categories.listAllCategories());
});

const categorySchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "key must be lowercase-with-hyphens"),
  labelEn: z.string().min(1).max(100),
  labelHi: z.string().min(1).max(100),
  shortLabelEn: z.string().min(1).max(50),
  shortLabelHi: z.string().min(1).max(50),
  priority: z.enum(categoryPriorities).optional(),
  isVisible: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

govExamsAdminRouter.post("/current-affair-categories", validateBody(categorySchema), async (req, res) => {
  const result = await categories.createCategory(req.body);
  if (!result.ok) return res.status(409).json({ error: "A category with this key already exists" });
  res.status(201).json(result.category);
});

govExamsAdminRouter.patch(
  "/current-affair-categories/:id",
  validateUuidParam("id"),
  validateBody(categorySchema.partial()),
  async (req, res) => {
    const result = await categories.updateCategory(req.params.id, req.body);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Category not found" });
      return res.status(409).json({ error: "A category with this key already exists" });
    }
    res.json(result.category);
  },
);

const reorderCategoriesSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

govExamsAdminRouter.post(
  "/current-affair-categories/reorder",
  validateBody(reorderCategoriesSchema),
  async (req, res) => {
    const result = await categories.reorderCategories(req.body.ids);
    if (!result.ok) return res.status(400).json({ error: "One or more category ids were not found" });
    res.json(await categories.listAllCategories());
  },
);

govExamsAdminRouter.delete("/current-affair-categories/:id", validateUuidParam("id"), async (req, res) => {
  const result = await categories.deleteCategory(req.params.id);
  if (!result.ok) {
    if ("notFound" in result) return res.status(404).json({ error: "Category not found" });
    if ("hasData" in result) {
      return res.status(409).json({
        error: `Cannot delete category — it has ${result.articleCount} associated current affair(s).`,
      });
    }
  }
  res.status(204).send();
});
