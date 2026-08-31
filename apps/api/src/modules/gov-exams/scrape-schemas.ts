import { z } from "zod";

// What we ask the AI Gateway to extract from a scraped page's markdown.
// Deliberately lenient (mostly nullable strings) — the model's job is
// extraction, not validation; scrape-validator.ts is what actually decides
// whether an item is sane enough to use. Dates are left as free-text strings
// here since scraped pages format them inconsistently (e.g. "15 Oct 2026",
// "15/10/2026") — the validator parses/sanity-checks them, not this schema.
//
// .nullable(), not .optional(): confirmed live against Groq that its strict
// json_schema mode rejects a JSON Schema where an optional property is
// simply absent from `required` — it requires every property in `properties`
// to also appear in `required`. Nullable-but-required is how you express an
// "optional" field within that constraint (the extraction prompt tells the
// model to use null, not omit the key, when a field isn't present).

// A hard structural cap, not just a prose instruction — real listing pages
// (e.g. sarkariresult.com's) can hold 100+ items, and asking a small/fast
// model to generate that many structured items in one completion reliably
// produces invalid JSON that Groq's own structured-output mode rejects
// before it ever reaches us (confirmed live). Bounding array length in the
// schema itself gives the model's constrained decoding an explicit limit
// to satisfy, not just a request it can ignore under pressure. A recurring
// sweep naturally catches more items across multiple runs; duplicates are
// already skipped via the slug-conflict check.
export const MAX_EXTRACTION_ITEMS = 10;

export const recruitmentExtractionItemSchema = z.object({
  title: z.string(),
  organizationName: z.string().nullable(),
  totalVacancies: z.number().int().positive().nullable(),
  qualification: z.string().nullable(),
  ageMin: z.number().int().positive().nullable(),
  ageMax: z.number().int().positive().nullable(),
  applicationStartDate: z.string().nullable(),
  applicationEndDate: z.string().nullable(),
  examDate: z.string().nullable(),
  officialNotificationUrl: z.string().nullable(),
  // Distinct from officialNotificationUrl — where a candidate actually
  // applies, if the page links that separately from the notification PDF.
  applyUrl: z.string().nullable(),
});
export type RecruitmentExtractionItem = z.infer<typeof recruitmentExtractionItemSchema>;

export const recruitmentExtractionSchema = z.object({
  items: z.array(recruitmentExtractionItemSchema).max(MAX_EXTRACTION_ITEMS),
});

// category keys are admin-configurable (CurrentAffairCategory table), so
// this schema can't be a static module-level enum anymore — callers build
// it per scrape run from the live category list (see gov-sources.service.ts).
export function buildCurrentAffairExtractionItemSchema(categoryKeys: string[]) {
  const keys = categoryKeys as [string, ...string[]];
  return z.object({
    title: z.string(),
    category: (keys.length > 0 ? z.enum(keys) : z.string()).nullable(),
    whatHappened: z.string(),
    keyFacts: z.array(z.string()).nullable(),
    whyImportant: z.string().nullable(),
    publishedDate: z.string().nullable(),
  });
}
export type CurrentAffairExtractionItem = z.infer<ReturnType<typeof buildCurrentAffairExtractionItemSchema>>;

export function buildCurrentAffairExtractionSchema(categoryKeys: string[]) {
  return z.object({
    items: z.array(buildCurrentAffairExtractionItemSchema(categoryKeys)).max(MAX_EXTRACTION_ITEMS),
  });
}

// A record whose values can be arbitrary JSON (string/number/boolean/null,
// or nested objects/arrays of the same, up to JSON_VALUE_MAX_DEPTH levels)
// — used below so richVacancySearchResultSchema stays a genuinely open shape
// (see its own comment for why) while still converting to a JSON Schema
// OpenAI's *strict* structured-output mode will accept.
//
// Two failure modes, both confirmed live against real OpenAI requests, rule
// out the two more obvious approaches:
//   - z.record(z.unknown())'s value type converts to `{}` (no "type" key at
//     all) via zod-to-json-schema — OpenAI's strict validator rejects that
//     outright ("schema must have a 'type' key").
//   - A recursive z.lazy() (self-referencing schema) fixes that, but the
//     resulting JSON Schema needs a $ref to express the cycle — and
//     apps/api never sees or controls the zodToJsonSchema() call at all
//     (it happens inside @amarjit_gts/universal-ai-ai-core's
//     structuredOutput(), which we only ever pass a raw Zod schema into),
//     so there's no way to pass the `definitions` option needed to hoist
//     that $ref to zod-to-json-schema's default target — top-level. OpenAI
//     rejects a $ref pointing anywhere else ("reference can only point to
//     definitions defined at the top level of the schema").
//   - A manually depth-bounded schema fixes THAT, but only if every branch
//     is a genuinely distinct object — zod-to-json-schema hoists to $ref
//     any Zod schema instance it encounters more than once *by reference*,
//     even with no real cycle, purely to avoid duplicating it in the
//     output. Building this with a shared `inner` variable reused across
//     a union's branches (the first version of this fix) still tripped
//     that: `inner` appears 3× per depth level, so it got hoisted anyway —
//     confirmed live, same rejection.
//
// makeJsonValueSchema() is a plain (non-memoized) function specifically so
// each of its 3 call sites per depth level constructs an independently-new
// schema object, even though they're structurally identical — no shared
// reference anywhere in the tree, so zod-to-json-schema has nothing to
// hoist and never emits a single $ref. The admin's own card/details/content
// prompt structure (recruitment_name → application → { start_date, ... },
// exam_pattern → { stages: [...] }, etc.) bottoms out at 2-3 levels of
// object/array nesting — JSON_VALUE_MAX_DEPTH leaves headroom above that.
//
// The explicit `z.ZodType<JsonValue>` return type is what keeps this from
// reviving the zod-to-json-schema/tsc depth limit the schema below's own
// comment warns about — without it, TS tries to infer each level's type
// from the one below it, and by JSON_VALUE_MAX_DEPTH levels of
// z.union/z.array/z.record composition that inferred type is enormous. The
// annotation gives TS one named type to check against instead.
const JSON_VALUE_MAX_DEPTH = 4;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function makeJsonValueSchema(depth: number): z.ZodType<JsonValue> {
  const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
  if (depth <= 0) return primitive;
  return z.union([makeJsonValueSchema(depth - 1), z.array(makeJsonValueSchema(depth - 1)), z.record(z.string(), makeJsonValueSchema(depth - 1))]);
}
const jsonValueSchema: z.ZodType<JsonValue> = makeJsonValueSchema(JSON_VALUE_MAX_DEPTH);

// Prompt-template web-search extraction (gov-search-prompts feature):
// unlike the two schemas above, this is deliberately NOT a fixed
// per-field shape. The admin's own prompt (see e.g. BankingJobPrompt.md /
// CurrentAffairsPrompt.md) already specifies the exact desired
// { card, details, content } structure in exhaustive prose detail — a
// second, independently-authored strict JSON Schema here would just be
// a second source of truth to keep in sync, AND would revive the
// documented zod-to-json-schema/tsc depth limit at real scale, since the
// rich shape nests far deeper than the thin schemas above already sit near
// that limit with. Each array item is
// left as an open record and handed to the same defensive mapper the
// manual JSON import already uses (import-mapper.ts /
// current-affairs-import-mapper.ts) — identical philosophy to how a
// manually-pasted import has no LLM-enforced schema at all.
export const richVacancySearchResultSchema = z.object({
  vacancies: z.array(z.record(z.string(), jsonValueSchema)).max(MAX_EXTRACTION_ITEMS),
});
export type RichVacancySearchResult = z.infer<typeof richVacancySearchResultSchema>;

export const richCurrentAffairSearchResultSchema = z.object({
  current_affairs: z.array(z.record(z.string(), jsonValueSchema)).max(MAX_EXTRACTION_ITEMS),
});
export type RichCurrentAffairSearchResult = z.infer<typeof richCurrentAffairSearchResultSchema>;
