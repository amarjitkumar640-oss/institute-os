import type { GovOrgType, GovSourceContentType, GovSourceFetchMode, Prisma, PrismaClient } from "@prisma/client";
import { extractStructured, webSearchExtract } from "../../lib/aiGatewayClient";
import { scrapeUrlToMarkdown } from "../../lib/firecrawl";
import { prisma } from "../../lib/prisma";
import * as govExams from "./gov-exams.service";
import {
  currentAffairExtractionSchema,
  MAX_EXTRACTION_ITEMS,
  recruitmentExtractionSchema,
  type CurrentAffairExtractionItem,
  type RecruitmentExtractionItem,
} from "./scrape-schemas";
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
  fetchMode: GovSourceFetchMode;
  organizationId?: string;
  label: string;
  url?: string;
  searchQuery?: string;
  enabled?: boolean;
}

export type CreateSourceResult =
  | { ok: true; source: Prisma.GovSourceGetPayload<{ include: { organization: true } }> }
  | { ok: false; notFound: true }
  | { ok: false; invalid: string };

// Exactly one of url/searchQuery must be set, matching fetchMode — a
// service-layer check, not a DB constraint, same convention as
// organizationId's conditional meaning by contentType elsewhere in this
// module.
function validateFetchModeFields(data: Partial<SourceInput>, fetchMode: GovSourceFetchMode): string | null {
  if (fetchMode === "url" && !data.url) return "A URL is required when fetch mode is 'url'";
  if (fetchMode === "search" && !data.searchQuery) return "A search query is required when fetch mode is 'search'";
  return null;
}

export async function createSource(data: SourceInput): Promise<CreateSourceResult> {
  const invalid = validateFetchModeFields(data, data.fetchMode);
  if (invalid) return { ok: false, invalid };

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

  const effectiveFetchMode = data.fetchMode ?? existing.fetchMode;
  const invalid = validateFetchModeFields(
    { url: data.url ?? existing.url ?? undefined, searchQuery: data.searchQuery ?? existing.searchQuery ?? undefined },
    effectiveFetchMode,
  );
  if (invalid) return { ok: false, invalid };

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

// Real listing pages (e.g. aggregator sites like sarkariresult.com) can run
// past 500,000 characters of markdown, formatted as a dense flat list of
// 100+ postings. Asking the model to extract "everything" from that in one
// completion means generating a huge JSON array in a single shot, which a
// small/fast model reliably fails to produce validly (confirmed live:
// Groq's own structured-output JSON validation rejected the output before
// it ever reached us). Bounding both the input slice and the requested
// item count keeps each call small and reliable — a recurring hourly sweep
// naturally catches items further down the page across multiple runs, and
// duplicates are already skipped via the slug-conflict check. Applies to
// url-mode sources only — search-mode sources go through the AI Gateway's
// native web search instead (see webSearchExtract), which never sends us
// raw page content to slice at all.
const MAX_MARKDOWN_CHARS = 6_000;

const EXTRACTION_SYSTEM_PROMPT =
  "You extract structured data from government-website page content. " +
  "Output ALL dates as ISO 8601 (YYYY-MM-DD). If a field isn't clearly present in the text, set it to null rather than guessing. " +
  `Extract at most ${MAX_EXTRACTION_ITEMS} items — the most recent/prominent ones — even if more are present in the text; do not try to extract everything.`;

type SourceWithOrg = Prisma.GovSourceGetPayload<{ include: { organization: true } }>;

type FetchAndExtractResult<T> = { ok: true; items: T[]; sourceUrl: string } | { ok: false; error: string };

async function fetchAndExtractRecruitments(source: SourceWithOrg): Promise<FetchAndExtractResult<RecruitmentExtractionItem>> {
  if (source.fetchMode === "search") {
    if (!source.searchQuery) return { ok: false, error: "No search query configured" };
    const result = await webSearchExtract({
      query: source.searchQuery,
      schema: recruitmentExtractionSchema,
      schemaName: "GovRecruitmentExtraction",
    });
    if (!result) return { ok: false, error: "Web search extraction failed or gateway unconfigured" };
    return { ok: true, items: result.data.items, sourceUrl: result.citations[0]?.url ?? `search:${source.searchQuery}` };
  }

  if (!source.url) return { ok: false, error: "No URL configured" };
  const markdown = await scrapeUrlToMarkdown(source.url);
  if (!markdown) return { ok: false, error: "Could not fetch page content" };

  const extracted = await extractStructured({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Extract the recruitment/vacancy notices from this page:\n\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}` },
    ],
    schema: recruitmentExtractionSchema,
    schemaName: "GovRecruitmentExtraction",
  });
  if (!extracted) return { ok: false, error: "AI extraction failed or gateway unconfigured" };
  return { ok: true, items: extracted.items, sourceUrl: source.url };
}

async function fetchAndExtractCurrentAffairs(source: SourceWithOrg): Promise<FetchAndExtractResult<CurrentAffairExtractionItem>> {
  if (source.fetchMode === "search") {
    if (!source.searchQuery) return { ok: false, error: "No search query configured" };
    const result = await webSearchExtract({
      query: source.searchQuery,
      schema: currentAffairExtractionSchema,
      schemaName: "GovCurrentAffairExtraction",
    });
    if (!result) return { ok: false, error: "Web search extraction failed or gateway unconfigured" };
    return { ok: true, items: result.data.items, sourceUrl: result.citations[0]?.url ?? `search:${source.searchQuery}` };
  }

  if (!source.url) return { ok: false, error: "No URL configured" };
  const markdown = await scrapeUrlToMarkdown(source.url);
  if (!markdown) return { ok: false, error: "Could not fetch page content" };

  const extracted = await extractStructured({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Extract the current-affairs items relevant to competitive exams from this page:\n\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}` },
    ],
    schema: currentAffairExtractionSchema,
    schemaName: "GovCurrentAffairExtraction",
  });
  if (!extracted) return { ok: false, error: "AI extraction failed or gateway unconfigured" };
  return { ok: true, items: extracted.items, sourceUrl: source.url };
}

async function scrapeRecruitmentSource(source: SourceWithOrg): Promise<ScrapeSourceResult> {
  const fetched = await fetchAndExtractRecruitments(source);
  if (!fetched.ok) {
    return { status: "error", error: fetched.error, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of fetched.items) {
    const validation = await validateRecruitmentItem(item, { organizationId: source.organizationId ?? undefined });
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    // createRecruitment() already rejects on slug clash — that IS the
    // dedupe check, no need to duplicate it here.
    const result = await govExams.createRecruitment({ ...validation.input, source: "scraped", sourceUrl: fetched.sourceUrl });
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
  const fetched = await fetchAndExtractCurrentAffairs(source);
  if (!fetched.ok) {
    return { status: "error", error: fetched.error, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of fetched.items) {
    const validation = validateCurrentAffairItem(item);
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    const result = await govExams.createCurrentAffair({ ...validation.input, source: "scraped", sourceUrl: fetched.sourceUrl });
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
