import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate";
import * as govExams from "./gov-exams.service";
import * as categories from "./current-affair-categories.service";
import { prisma } from "../../lib/prisma";

export const govExamsRouter = Router();

// ── GET /api/gov-exams/recruitments ──────────────────────────────────────────
const listRecruitmentsQuery = z.object({
  category: z.enum(["ssc", "banking", "railway", "other"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
type ListRecruitmentsQuery = z.infer<typeof listRecruitmentsQuery>;
type ReqWithRecruitmentsQuery = Request & { parsedQuery: ListRecruitmentsQuery };

// Public feed — published only, never draft/archived.
govExamsRouter.get("/recruitments", validateQuery(listRecruitmentsQuery), async (req, res) => {
  const query = (req as ReqWithRecruitmentsQuery).parsedQuery;
  const result = await govExams.listRecruitments({ ...query, status: "published" });
  res.json(result);
});

govExamsRouter.get("/recruitments/:slug", async (req, res) => {
  const recruitment = await govExams.getRecruitmentBySlug(req.params.slug);
  if (!recruitment) return res.status(404).json({ error: "Not found" });
  res.json(recruitment);
});

// ── GET /api/gov-exams/current-affair-categories — public, unauthenticated ───
govExamsRouter.get("/current-affair-categories", async (_req, res) => {
  res.json(await categories.listVisibleCategories());
});

// ── GET /api/gov-exams/current-affairs ───────────────────────────────────────
const listCurrentAffairsQuery = z.object({
  category: z.string().min(1).optional(), // a CurrentAffairCategory.key, not the id
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
type ListCurrentAffairsQuery = z.infer<typeof listCurrentAffairsQuery>;
type ReqWithCurrentAffairsQuery = Request & { parsedQuery: ListCurrentAffairsQuery };

async function resolveCategoryId(key: string | undefined): Promise<{ ok: true; categoryId: string | undefined } | { ok: false }> {
  if (!key) return { ok: true, categoryId: undefined };
  const match = await prisma.currentAffairCategory.findUnique({ where: { key } });
  return match ? { ok: true, categoryId: match.id } : { ok: false };
}

govExamsRouter.get("/current-affairs", validateQuery(listCurrentAffairsQuery), async (req, res) => {
  const { category, ...query } = (req as ReqWithCurrentAffairsQuery).parsedQuery;
  const resolved = await resolveCategoryId(category);
  // Unmatched key (e.g. a stale deep link to a since-deleted category) —
  // return an empty result set rather than every article or a 400.
  if (!resolved.ok) return res.json({ data: [], total: 0, page: query.page, limit: query.limit, pages: 0 });
  const result = await govExams.listCurrentAffairs({ ...query, categoryId: resolved.categoryId, status: "published" });
  res.json(result);
});

// ── GET /api/gov-exams/current-affairs/dates — public, unauthenticated ───────
// Which calendar days actually have published current affairs, most recent
// first — powers the exam-portal's date strip and its "latest date with
// content" default. Registered before /current-affairs/:slug so "dates"
// isn't matched as a slug.
const listCurrentAffairDatesQuery = z.object({
  category: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(60).default(14),
});
type ListCurrentAffairDatesQuery = z.infer<typeof listCurrentAffairDatesQuery>;
type ReqWithCurrentAffairDatesQuery = Request & { parsedQuery: ListCurrentAffairDatesQuery };

govExamsRouter.get("/current-affairs/dates", validateQuery(listCurrentAffairDatesQuery), async (req, res) => {
  const { category, limit } = (req as ReqWithCurrentAffairDatesQuery).parsedQuery;
  const resolved = await resolveCategoryId(category);
  if (!resolved.ok) return res.json([]);
  res.json(await govExams.listCurrentAffairDates({ categoryId: resolved.categoryId, limit }));
});

govExamsRouter.get("/current-affairs/:slug", async (req, res) => {
  const affair = await govExams.getCurrentAffairBySlug(req.params.slug);
  if (!affair) return res.status(404).json({ error: "Not found" });
  res.json(affair);
});

// ── POST /api/gov-exams/eligibility-check ────────────────────────────────────
// Deterministic rule engine (see gov-exams.service.ts) — never an LLM call.
const eligibilityCheckSchema = z.object({
  age: z.number().int().positive().max(100),
  qualification: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
});

govExamsRouter.post("/eligibility-check", validateBody(eligibilityCheckSchema), async (req, res) => {
  const matches = await govExams.checkEligibility(req.body);
  res.json(matches);
});
