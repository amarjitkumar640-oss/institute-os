import type { Prisma } from "@prisma/client";
import { obj, str, strArray, type RawImportItem } from "./import-mapper";
import { parseSaneDate } from "./scrape-validator";
import type { CurrentAffairExtractionItem } from "./scrape-schemas";

// Maps one raw current-affairs item — from the prompt-template scraper or
// an admin-pasted JSON import, both in the same { card, details, content }
// shape (see CurrentAffairsPrompt.md) — into our internal types. Same
// defensive-not-strict reasoning as import-mapper.ts: every read is a safe
// optional lookup, since the exact field set can drift.

// Feeds the EXISTING validateCurrentAffairItem() (scrape-validator.ts)
// unchanged — same category-matching/draft-vs-published rules the scraper
// already applies, so an imported item gets no special treatment.
export function mapToCurrentAffairExtractionItem(raw: RawImportItem): CurrentAffairExtractionItem {
  const card = obj(raw, "card");
  const details = obj(raw, "details");

  return {
    title: str(details, "title") ?? str(card, "title") ?? "",
    category: str(details, "category") ?? str(card, "category"),
    whatHappened: str(details, "description") ?? "",
    keyFacts: strArray(details, "key_facts") ?? null,
    whyImportant: str(details, "why_important"),
    publishedDate:
      str(details, "event_date") ?? str(details, "announcement_date") ?? str(details, "notification_date"),
  };
}

// Boolean-flag exam relevance, e.g. { ssc: true, banking: false, other: [] }
// — passes through whatever the JSON has, keeping only boolean and
// string-array values (matches CurrentAffairInput.examRelevance's widened
// type) rather than validating an exact key set, since the approved exam
// list can grow without a code change here.
function examRelevanceFlags(details: RawImportItem | undefined): Record<string, boolean | string[]> | undefined {
  const raw = obj(details, "exam_relevance");
  if (!raw) return undefined;
  const out: Record<string, boolean | string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface RichCurrentAffairFields {
  level?: string;
  newsStatus?: string;
  importance?: string;
  organization?: string;
  ministry?: string;
  state?: string;
  eventDate?: Date;
  verificationStatus?: string;
  // The real cited news source URL for this specific item — distinct from
  // the batch-level search citation the sweep falls back to when an item
  // doesn't carry its own. Used for dedup (see createCurrentAffair) since a
  // repeated search of the same real-world event is far more likely to
  // reproduce this than an exact title/slug match.
  sourceUrl?: string;
  examRelevance?: Record<string, boolean | string[]>;
  richData?: Prisma.InputJsonValue;
}

// Everything else the extraction shape carries beyond validateCurrentAffairItem's
// thin fields and the typed-essential columns above — passed through
// unvalidated as richData, same "long tail in one blob" reasoning as the
// GovCurrentAffair.richData column comment.
export function mapToCurrentAffairRichFields(raw: RawImportItem): RichCurrentAffairFields {
  const card = obj(raw, "card");
  const details = obj(raw, "details");
  const content = obj(raw, "content");
  const source = obj(details, "source");

  const richData: Record<string, unknown> = {};
  const pass = (target: RawImportItem | undefined, key: string) => {
    const v = target?.[key];
    if (v !== undefined && v !== null && v !== "") richData[key] = v;
  };
  pass(details, "subcategory");
  pass(details, "short_title");
  pass(details, "district");
  pass(details, "one_liner");
  pass(details, "exam_facts");
  pass(details, "people");
  pass(details, "organizations_involved");
  pass(details, "places");
  pass(details, "numbers");
  pass(details, "scheme_or_policy");
  pass(details, "appointment");
  pass(details, "award");
  pass(details, "report_or_index");
  pass(details, "international");
  pass(details, "official_links");
  pass(details, "start_date");
  pass(details, "end_date");
  pass(details, "implementation_date");
  pass(details, "notification_date");
  pass(details, "deadline_date");
  pass(details, "appointment_date");
  pass(details, "launch_date");
  pass(details, "result_date");
  if (source) {
    pass(source, "official_source");
    pass(source, "secondary_sources");
    pass(source, "last_verified_at");
  }
  if (content) {
    pass(content, "summary");
    pass(content, "why_in_news");
    pass(content, "highlights");
    pass(content, "exam_facts");
    pass(content, "one_liner");
    pass(content, "who_should_remember");
    pass(content, "important_note");
  }

  return {
    level: str(details, "level") ?? str(card, "level") ?? undefined,
    newsStatus: str(details, "status") ?? str(card, "status") ?? undefined,
    importance: str(details, "importance") ?? str(card, "importance") ?? undefined,
    organization: str(details, "organization") ?? str(card, "organization") ?? undefined,
    ministry: str(details, "ministry") ?? undefined,
    state: str(details, "state") ?? undefined,
    eventDate: parseSaneDate(str(details, "event_date") ?? str(card, "event_date")) ?? undefined,
    verificationStatus: str(source, "verification_status") ?? undefined,
    sourceUrl: str(source, "source_url") ?? undefined,
    examRelevance: examRelevanceFlags(details),
    richData: Object.keys(richData).length > 0 ? (richData as Prisma.InputJsonValue) : undefined,
  };
}

