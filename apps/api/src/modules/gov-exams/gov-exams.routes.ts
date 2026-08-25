import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { validateBody, validateQuery } from "../../middleware/validate";
import * as govExams from "./gov-exams.service";

export const govExamsRouter = Router();

// ── GET /api/gov-exams/organizations — public, unauthenticated ───────────────
govExamsRouter.get("/organizations", async (_req, res) => {
  res.json(await govExams.listOrganizations());
});

// ── GET /api/gov-exams/recruitments ──────────────────────────────────────────
const listRecruitmentsQuery = z.object({
  organizationId: z.string().uuid().optional(),
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

// ── GET /api/gov-exams/current-affairs ───────────────────────────────────────
const currentAffairCategories = [
  "national", "international", "banking", "economy", "science", "technology",
  "defence", "sports", "awards", "appointments", "govt_schemes", "environment",
] as const;

const listCurrentAffairsQuery = z.object({
  category: z.enum(currentAffairCategories).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
type ListCurrentAffairsQuery = z.infer<typeof listCurrentAffairsQuery>;
type ReqWithCurrentAffairsQuery = Request & { parsedQuery: ListCurrentAffairsQuery };

govExamsRouter.get("/current-affairs", validateQuery(listCurrentAffairsQuery), async (req, res) => {
  const query = (req as ReqWithCurrentAffairsQuery).parsedQuery;
  const result = await govExams.listCurrentAffairs({ ...query, status: "published" });
  res.json(result);
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
