import type { GovOrgType, GovSourceContentType, Prisma, PrismaClient } from "@prisma/client";
import { extractStructured } from "../../lib/aiGatewayClient";
import { scrapeUrlToMarkdown } from "../../lib/firecrawl";
import { prisma } from "../../lib/prisma";
import * as govExams from "./gov-exams.service";
import { currentAffairExtractionSchema, recruitmentExtractionSchema } from "./scrape-schemas";
import { validateCurrentAffairItem, validateRecruitmentItem } from "./scrape-validator";

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listSources() {
  return prisma.govSource.findMany({
    include: { organization: true },
    orderBy: [{ category: "asc" }, { label: "asc" }],
  });
}

export interface SourceInput {
  category: GovOrgType;
  contentType: GovSourceContentType;
  organizationId?: string;
  label: string;
  url: string;
  enabled?: boolean;
}

export type CreateSourceResult =
  | { ok: true; source: Prisma.GovSourceGetPayload<{ include: { organization: true } }> }
  | { ok: false; notFound: true };

export async function createSource(data: SourceInput): Promise<CreateSourceResult> {
  if (data.organizationId) {
    const org = await prisma.govOrganization.findUnique({ where: { id: data.organizationId } });
    if (!org) return { ok: false, notFound: true };
  }
  const source = await prisma.govSource.create({ data, include: { organization: true } });
  return { ok: true, source };
}

export type UpdateSourceResult = CreateSourceResult;

export async function updateSource(id: string, data: Partial<SourceInput>): Promise<UpdateSourceResult> {
  const existing = await prisma.govSource.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  if (data.organizationId) {
    const org = await prisma.govOrganization.findUnique({ where: { id: data.organizationId } });
    if (!org) return { ok: false, notFound: true };
  }

  const source = await prisma.govSource.update({ where: { id }, data, include: { organization: true } });
  return { ok: true, source };
}

export async function deleteSource(id: string): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govSource.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govSource.delete({ where: { id } });
  return { ok: true };
}

// ── Scraping ──────────────────────────────────────────────────────────────────

export interface ScrapeSourceResult {
  status: "success" | "partial" | "error";
  error?: string;
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
}

const EXTRACTION_SYSTEM_PROMPT =
  "You extract structured data from government-website page content. " +
  "Output ALL dates as ISO 8601 (YYYY-MM-DD). If a field isn't clearly present in the text, set it to null rather than guessing.";

// Truncated well under typical model context limits — scraped pages can be
// long, and the extraction only needs the actual listing content, not an
// entire page's boilerplate.
const MAX_MARKDOWN_CHARS = 15_000;

type SourceWithOrg = Prisma.GovSourceGetPayload<{ include: { organization: true } }>;

async function scrapeRecruitmentSource(source: SourceWithOrg): Promise<ScrapeSourceResult> {
  const markdown = await scrapeUrlToMarkdown(source.url);
  if (!markdown) {
    return { status: "error", error: "Could not fetch page content", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  const extracted = await extractStructured({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Extract every recruitment/vacancy notice from this page:\n\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}` },
    ],
    schema: recruitmentExtractionSchema,
    schemaName: "GovRecruitmentExtraction",
  });
  if (!extracted) {
    return { status: "error", error: "AI extraction failed or gateway unconfigured", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of extracted.items) {
    const validation = await validateRecruitmentItem(item, { organizationId: source.organizationId ?? undefined });
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    // createRecruitment() already rejects on slug clash — that IS the
    // dedupe check, no need to duplicate it here.
    const result = await govExams.createRecruitment({ ...validation.input, source: "scraped", sourceUrl: source.url });
    if (!result.ok) {
      skippedDuplicates++;
      continue;
    }
    created++;

    if (validation.outcome === "published") {
      await govExams.setRecruitmentStatus(result.recruitment.id, "published");
      published++;
    }
  }

  return { status: unusable > 0 && created === 0 ? "partial" : "success", created, published, skippedDuplicates, unusable };
}

async function scrapeCurrentAffairSource(source: SourceWithOrg): Promise<ScrapeSourceResult> {
  const markdown = await scrapeUrlToMarkdown(source.url);
  if (!markdown) {
    return { status: "error", error: "Could not fetch page content", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  const extracted = await extractStructured({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Extract every current-affairs item relevant to competitive exams from this page:\n\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}` },
    ],
    schema: currentAffairExtractionSchema,
    schemaName: "GovCurrentAffairExtraction",
  });
  if (!extracted) {
    return { status: "error", error: "AI extraction failed or gateway unconfigured", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of extracted.items) {
    const validation = validateCurrentAffairItem(item);
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    const result = await govExams.createCurrentAffair({ ...validation.input, source: "scraped", sourceUrl: source.url });
    if (!result.ok) {
      skippedDuplicates++;
      continue;
    }
    created++;

    if (validation.outcome === "published") {
      await govExams.setCurrentAffairStatus(result.currentAffair.id, "published");
      published++;
    }
  }

  return { status: unusable > 0 && created === 0 ? "partial" : "success", created, published, skippedDuplicates, unusable };
}

export async function scrapeSource(source: SourceWithOrg): Promise<ScrapeSourceResult> {
  return source.contentType === "recruitment" ? scrapeRecruitmentSource(source) : scrapeCurrentAffairSource(source);
}

// ── Scheduled sweep (registered in modules/jobs/registry.ts) ──────────────────

export interface SourceScrapeSweepResult {
  [key: string]: number;
  sourcesProcessed: number;
  sourcesFailed: number;
  totalCreated: number;
  totalPublished: number;
}

export async function runSourceScrapeSweep(db: PrismaClient): Promise<SourceScrapeSweepResult> {
  const sources = await db.govSource.findMany({ where: { enabled: true }, include: { organization: true } });

  let sourcesProcessed = 0;
  let sourcesFailed = 0;
  let totalCreated = 0;
  let totalPublished = 0;

  for (const source of sources) {
    try {
      // scrapeSource() (and the govExams.* helpers it calls) go through the
      // shared prisma singleton, not this `db` param — there is only ever
      // one PrismaClient instance in this process, so they're the same
      // connection either way. `db` here is just to match JobDefinition's
      // signature (see modules/jobs/registry.ts) and for the source's own
      // status-tracking update below.
      const result = await scrapeSource(source);
      totalCreated += result.created;
      totalPublished += result.published;
      sourcesProcessed++;
      if (result.status === "error") sourcesFailed++;

      await db.govSource.update({
        where: { id: source.id },
        data: { lastScrapedAt: new Date(), lastScrapeStatus: result.status, lastScrapeError: result.error ?? null },
      });
    } catch (e) {
      sourcesFailed++;
      const message = e instanceof Error ? e.message : String(e);
      await db.govSource
        .update({ where: { id: source.id }, data: { lastScrapedAt: new Date(), lastScrapeStatus: "error", lastScrapeError: message } })
        .catch(() => {}); // don't let a failed status-write take down the rest of the sweep
    }
  }

  return { sourcesProcessed, sourcesFailed, totalCreated, totalPublished };
}
