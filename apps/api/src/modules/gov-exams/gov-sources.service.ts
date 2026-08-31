import type {
  GovCurrentAffairsPromptTemplate,
  GovJobVacancyPromptTemplate,
  GovOrgType,
  GovScheduleFrequency,
  GovSourceContentType,
  GovSourceFetchMode,
  Prisma,
} from "@prisma/client";
import { extractStructured, webSearchExtract, type Citation } from "../../lib/aiGateway";
import { scrapeUrlToMarkdown } from "../../lib/firecrawl";
import { prisma } from "../../lib/prisma";
import { validateScheduleFields } from "../../lib/schedule";
import * as govExams from "./gov-exams.service";
import * as categories from "./current-affair-categories.service";
import {
  buildCurrentAffairExtractionSchema,
  MAX_EXTRACTION_ITEMS,
  recruitmentExtractionSchema,
  richCurrentAffairSearchResultSchema,
  richVacancySearchResultSchema,
  type CurrentAffairExtractionItem,
  type RecruitmentExtractionItem,
} from "./scrape-schemas";
import { validateCurrentAffairItem, validateRecruitmentItem, type CurrentAffairCategoryLookup } from "./scrape-validator";
import { mapToExtractionItem, mapToRichFields, type RawImportItem } from "./import-mapper";
import { mapToCurrentAffairExtractionItem, mapToCurrentAffairRichFields } from "./current-affairs-import-mapper";

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listSources() {
  return prisma.govSource.findMany({
    orderBy: [{ category: "asc" }, { label: "asc" }],
  });
}

export function getSourceById(id: string) {
  return prisma.govSource.findUnique({ where: { id } });
}

export interface SourceInput {
  category: GovOrgType;
  contentType: GovSourceContentType;
  fetchMode: GovSourceFetchMode;
  label: string;
  url?: string;
  searchQuery?: string;
  enabled?: boolean;
  scheduleFrequency?: GovScheduleFrequency;
  scheduleTimeOfDay?: string;
  scheduleDayOfWeek?: number;
  scheduleDayOfMonth?: number;
}

export type CreateSourceResult =
  | { ok: true; source: Prisma.GovSourceGetPayload<object> }
  | { ok: false; invalid: string };

export type UpdateSourceResult =
  | { ok: true; source: Prisma.GovSourceGetPayload<object> }
  | { ok: false; notFound: true }
  | { ok: false; invalid: string };

// Exactly one of url/searchQuery must be set, matching fetchMode — a
// service-layer check, not a DB constraint.
function validateFetchModeFields(data: Partial<SourceInput>, fetchMode: GovSourceFetchMode): string | null {
  if (fetchMode === "url" && !data.url) return "A URL is required when fetch mode is 'url'";
  if (fetchMode === "search" && !data.searchQuery) return "A search query is required when fetch mode is 'search'";
  return null;
}

export async function createSource(data: SourceInput): Promise<CreateSourceResult> {
  const invalid = validateFetchModeFields(data, data.fetchMode)
    ?? validateScheduleFields({
      frequency: data.scheduleFrequency ?? "hourly",
      timeOfDay: data.scheduleTimeOfDay ?? null,
      dayOfWeek: data.scheduleDayOfWeek ?? null,
      dayOfMonth: data.scheduleDayOfMonth ?? null,
    });
  if (invalid) return { ok: false, invalid };

  const source = await prisma.govSource.create({ data });
  return { ok: true, source };
}

export async function updateSource(id: string, data: Partial<SourceInput>): Promise<UpdateSourceResult> {
  const existing = await prisma.govSource.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  const effectiveFetchMode = data.fetchMode ?? existing.fetchMode;
  const invalid = validateFetchModeFields(
    { url: data.url ?? existing.url ?? undefined, searchQuery: data.searchQuery ?? existing.searchQuery ?? undefined },
    effectiveFetchMode,
  ) ?? validateScheduleFields({
    frequency: data.scheduleFrequency ?? existing.scheduleFrequency,
    timeOfDay: data.scheduleTimeOfDay ?? existing.scheduleTimeOfDay,
    dayOfWeek: data.scheduleDayOfWeek ?? existing.scheduleDayOfWeek,
    dayOfMonth: data.scheduleDayOfMonth ?? existing.scheduleDayOfMonth,
  });
  if (invalid) return { ok: false, invalid };

  const source = await prisma.govSource.update({ where: { id }, data });
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

type GovSourceRow = Prisma.GovSourceGetPayload<object>;

type FetchAndExtractResult<T> = { ok: true; items: T[]; sourceUrl: string } | { ok: false; error: string };

async function fetchAndExtractRecruitments(source: GovSourceRow): Promise<FetchAndExtractResult<RecruitmentExtractionItem>> {
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
  if (!extracted.ok) return { ok: false, error: `AI extraction failed: ${extracted.error}` };
  return { ok: true, items: extracted.data.items, sourceUrl: source.url };
}

async function fetchAndExtractCurrentAffairs(
  source: GovSourceRow,
  categoryKeys: string[],
): Promise<FetchAndExtractResult<CurrentAffairExtractionItem>> {
  const schema = buildCurrentAffairExtractionSchema(categoryKeys);

  if (!source.url) return { ok: false, error: "No URL configured" };
  const markdown = await scrapeUrlToMarkdown(source.url);
  if (!markdown) return { ok: false, error: "Could not fetch page content" };

  const extracted = await extractStructured({
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Extract the current-affairs items relevant to competitive exams from this page:\n\n${markdown.slice(0, MAX_MARKDOWN_CHARS)}` },
    ],
    schema,
    schemaName: "GovCurrentAffairExtraction",
  });
  if (!extracted.ok) return { ok: false, error: `AI extraction failed: ${extracted.error}` };
  return { ok: true, items: extracted.data.items, sourceUrl: source.url };
}

async function scrapeRecruitmentSource(source: GovSourceRow): Promise<ScrapeSourceResult> {
  const fetched = await fetchAndExtractRecruitments(source);
  if (!fetched.ok) {
    return { status: "error", error: fetched.error, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of fetched.items) {
    const validation = validateRecruitmentItem(item, { category: source.category });
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

async function scrapeCurrentAffairSource(source: GovSourceRow): Promise<ScrapeSourceResult> {
  const [allCategories, defaultCategory] = await Promise.all([
    categories.listVisibleCategories(),
    categories.getDefaultCategory(),
  ]);
  if (!defaultCategory) {
    return { status: "error", error: "No current-affair categories configured", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }
  const lookup: CurrentAffairCategoryLookup = {
    categoryKeyToId: new Map(allCategories.map((c) => [c.key, c.id])),
    defaultCategoryId: defaultCategory.id,
  };

  const fetched = await fetchAndExtractCurrentAffairs(source, allCategories.map((c) => c.key));
  if (!fetched.ok) {
    return { status: "error", error: fetched.error, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const item of fetched.items) {
    const validation = validateCurrentAffairItem(item, lookup);
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

export async function scrapeSource(source: GovSourceRow): Promise<ScrapeSourceResult> {
  return source.contentType === "recruitment" ? scrapeRecruitmentSource(source) : scrapeCurrentAffairSource(source);
}

// ── Prompt-template web search (replaces GovSource's old "search" fetchMode) ──
// One admin-written prompt per job-vacancy category, or one shared
// current-affairs prompt (see GovJobVacancyPromptTemplate /
// GovCurrentAffairsPromptTemplate) — passed to the AI Gateway's web search
// as-is, then mapped through the exact same defensive mappers +
// deterministic validators the manual JSON import uses (import-mapper.ts /
// current-affairs-import-mapper.ts, scrape-validator.ts), so a
// prompt-template result gets no special treatment versus a hand-pasted one.

// useCachedSearch replays the last cached search answer (lastSearchContent/
// lastSearchCitations) instead of paying for and waiting on a new one —
// for retrying an extraction-side fix (schema bug, mapper bug) against a
// real prior search. Only meaningful when a cache actually exists; falls
// through to a real search otherwise.
export async function runJobVacancyPromptTemplate(
  template: GovJobVacancyPromptTemplate,
  options?: { useCachedSearch?: boolean },
): Promise<ScrapeSourceResult> {
  const cachedSearch =
    options?.useCachedSearch && template.lastSearchContent
      ? { content: template.lastSearchContent, citations: ((template.lastSearchCitations as Citation[] | null) ?? []) }
      : undefined;

  const result = await webSearchExtract({
    query: template.prompt,
    schema: richVacancySearchResultSchema,
    schemaName: "GovJobVacancyPromptExtraction",
    cachedSearch,
  });

  if (result.search) {
    await prisma.govJobVacancyPromptTemplate
      .update({
        where: { category: template.category },
        data: {
          lastSearchContent: result.search.content,
          lastSearchCitations: result.search.citations as unknown as Prisma.InputJsonValue,
          lastSearchAt: new Date(),
        },
      })
      .catch(() => {});
  }

  if (!result.ok) {
    return { status: "error", error: `Web search extraction failed: ${result.error}`, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  const sourceUrl = result.citations[0]?.url;

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const raw of result.data.vacancies) {
    const rawItem = raw as RawImportItem;
    const extractionItem = mapToExtractionItem(rawItem);
    const validation = validateRecruitmentItem(extractionItem, { category: template.category });
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    const { sourceUrl: richSourceUrl, ...richFields } = mapToRichFields(rawItem);
    const createResult = await govExams.createRecruitment({
      ...validation.input,
      ...richFields,
      source: "scraped",
      sourceUrl: richSourceUrl ?? sourceUrl,
    });
    if (!createResult.ok) {
      skippedDuplicates++;
      continue;
    }
    created++;

    if (validation.outcome === "published") {
      await govExams.setRecruitmentStatus(createResult.recruitment.id, "published");
      published++;
    }
  }

  return { status: unusable > 0 && created === 0 ? "partial" : "success", created, published, skippedDuplicates, unusable };
}

// Anchors the admin's static prompt (its own freshness language like "last
// 24 hours" has nothing to anchor to otherwise) to the real current date,
// and — when this template has run successfully before — tells the model
// when that was, so it can favor genuinely new developments over
// re-surfacing what a previous run already found. Runs daily (see
// modules/jobs/registry.ts's gov-current-affairs-sweep), so "since
// yesterday" is the natural framing.
function buildCurrentAffairsQuery(template: GovCurrentAffairsPromptTemplate): string {
  const today = new Date().toISOString().slice(0, 10);
  const context = template.lastRunAt
    ? `Today's date is ${today}. This search was last run on ${template.lastRunAt.toISOString().slice(0, 10)} — prioritize developments genuinely new since then, while still following the freshness rules below.`
    : `Today's date is ${today}.`;
  return `${context}\n\n${template.prompt}`;
}

// See runJobVacancyPromptTemplate's identical option for why.
export async function runCurrentAffairsPromptTemplate(
  template: GovCurrentAffairsPromptTemplate,
  options?: { useCachedSearch?: boolean },
): Promise<ScrapeSourceResult> {
  const [allCategories, defaultCategory] = await Promise.all([
    categories.listVisibleCategories(),
    categories.getDefaultCategory(),
  ]);
  if (!defaultCategory) {
    return { status: "error", error: "No current-affair categories configured", created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }
  const lookup: CurrentAffairCategoryLookup = {
    categoryKeyToId: new Map(allCategories.map((c) => [c.key, c.id])),
    defaultCategoryId: defaultCategory.id,
  };

  const cachedSearch =
    options?.useCachedSearch && template.lastSearchContent
      ? { content: template.lastSearchContent, citations: ((template.lastSearchCitations as Citation[] | null) ?? []) }
      : undefined;

  const result = await webSearchExtract({
    query: buildCurrentAffairsQuery(template),
    schema: richCurrentAffairSearchResultSchema,
    schemaName: "GovCurrentAffairsPromptExtraction",
    cachedSearch,
  });

  if (result.search) {
    await prisma.govCurrentAffairsPromptTemplate
      .update({
        where: { id: "singleton" },
        data: {
          lastSearchContent: result.search.content,
          lastSearchCitations: result.search.citations as unknown as Prisma.InputJsonValue,
          lastSearchAt: new Date(),
        },
      })
      .catch(() => {});
  }

  if (!result.ok) {
    return { status: "error", error: `Web search extraction failed: ${result.error}`, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 };
  }

  const batchSourceUrl = result.citations[0]?.url;
  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;

  for (const raw of result.data.current_affairs) {
    const rawItem = raw as RawImportItem;
    const extractionItem = mapToCurrentAffairExtractionItem(rawItem);
    const validation = validateCurrentAffairItem(extractionItem, lookup);
    if (validation.outcome === "unusable") {
      unusable++;
      continue;
    }

    const rich = mapToCurrentAffairRichFields(rawItem);
    const createResult = await govExams.createCurrentAffair({
      ...validation.input,
      ...rich,
      source: "scraped",
      sourceUrl: rich.sourceUrl ?? batchSourceUrl,
    });
    if (!createResult.ok) {
      skippedDuplicates++;
      continue;
    }
    created++;

    if (validation.outcome === "published") {
      await govExams.setCurrentAffairStatus(createResult.currentAffair.id, "published");
      published++;
    }
  }

  return { status: unusable > 0 && created === 0 ? "partial" : "success", created, published, skippedDuplicates, unusable };
}

// ── Per-row run + status bookkeeping ────────────────────────────────────────
// Each row (a GovSource, a GovJobVacancyPromptTemplate, or the
// GovCurrentAffairsPromptTemplate singleton) is independently schedulable
// (see lib/schedule.ts, gov-exams-scheduler.ts) — there's no bundled sweep
// anymore. These three wrappers are the one place that writes each model's
// own status fields, shared by both the scheduler tick and the manual
// "Run Now" routes (gov-sources-admin.routes.ts, gov-search-prompts.routes.ts)
// — same "one code path for bookkeeping" principle as modules/jobs/runner.ts.
// Each also has its own "already running" guard, keyed by row identity, so
// a scheduler-fired run and a manual Run Now click on the same row can't
// race each other — same purpose as runner.ts's runningKeys, just three
// independent sets instead of one, since these are independent work items.

export type RunOutcome = { skipped: true; reason: string } | { skipped: false; result: ScrapeSourceResult };

const runningSourceIds = new Set<string>();

export async function runSourceAndRecordStatus(source: GovSourceRow): Promise<RunOutcome> {
  if (runningSourceIds.has(source.id)) return { skipped: true, reason: "already running" };
  runningSourceIds.add(source.id);
  try {
    const result = await scrapeSource(source);
    await prisma.govSource.update({
      where: { id: source.id },
      data: { lastScrapedAt: new Date(), lastScrapeStatus: result.status, lastScrapeError: result.error ?? null },
    });
    return { skipped: false, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.govSource
      .update({ where: { id: source.id }, data: { lastScrapedAt: new Date(), lastScrapeStatus: "error", lastScrapeError: message } })
      .catch(() => {}); // don't let a failed status-write mask the real error
    return { skipped: false, result: { status: "error", error: message, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 } };
  } finally {
    runningSourceIds.delete(source.id);
  }
}

const runningJobVacancyCategories = new Set<GovOrgType>();

export async function runJobVacancyPromptTemplateAndRecordStatus(
  template: GovJobVacancyPromptTemplate,
  options?: { useCachedSearch?: boolean },
): Promise<RunOutcome> {
  if (runningJobVacancyCategories.has(template.category)) return { skipped: true, reason: "already running" };
  runningJobVacancyCategories.add(template.category);
  try {
    const result = await runJobVacancyPromptTemplate(template, options);
    await prisma.govJobVacancyPromptTemplate.update({
      where: { category: template.category },
      data: { lastRunAt: new Date(), lastRunStatus: result.status, lastRunError: result.error ?? null },
    });
    return { skipped: false, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.govJobVacancyPromptTemplate
      .update({ where: { category: template.category }, data: { lastRunAt: new Date(), lastRunStatus: "error", lastRunError: message } })
      .catch(() => {});
    return { skipped: false, result: { status: "error", error: message, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 } };
  } finally {
    runningJobVacancyCategories.delete(template.category);
  }
}

let currentAffairsRunning = false;

export async function runCurrentAffairsPromptTemplateAndRecordStatus(
  template: GovCurrentAffairsPromptTemplate,
  options?: { useCachedSearch?: boolean },
): Promise<RunOutcome> {
  if (currentAffairsRunning) return { skipped: true, reason: "already running" };
  currentAffairsRunning = true;
  try {
    const result = await runCurrentAffairsPromptTemplate(template, options);
    await prisma.govCurrentAffairsPromptTemplate.update({
      where: { id: "singleton" },
      data: { lastRunAt: new Date(), lastRunStatus: result.status, lastRunError: result.error ?? null },
    });
    return { skipped: false, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.govCurrentAffairsPromptTemplate
      .update({ where: { id: "singleton" }, data: { lastRunAt: new Date(), lastRunStatus: "error", lastRunError: message } })
      .catch(() => {});
    return { skipped: false, result: { status: "error", error: message, created: 0, published: 0, skippedDuplicates: 0, unusable: 0 } };
  } finally {
    currentAffairsRunning = false;
  }
}
