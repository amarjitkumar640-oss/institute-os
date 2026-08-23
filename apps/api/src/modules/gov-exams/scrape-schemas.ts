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

const currentAffairCategories = [
  "national", "international", "banking", "economy", "science", "technology",
  "defence", "sports", "awards", "appointments", "govt_schemes", "environment",
] as const;

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
});
export type RecruitmentExtractionItem = z.infer<typeof recruitmentExtractionItemSchema>;

export const recruitmentExtractionSchema = z.object({
  items: z.array(recruitmentExtractionItemSchema).max(MAX_EXTRACTION_ITEMS),
});

export const currentAffairExtractionItemSchema = z.object({
  title: z.string(),
  category: z.enum(currentAffairCategories).nullable(),
  whatHappened: z.string(),
  keyFacts: z.array(z.string()).nullable(),
  whyImportant: z.string().nullable(),
  publishedDate: z.string().nullable(),
});
export type CurrentAffairExtractionItem = z.infer<typeof currentAffairExtractionItemSchema>;

export const currentAffairExtractionSchema = z.object({
  items: z.array(currentAffairExtractionItemSchema).max(MAX_EXTRACTION_ITEMS),
});
