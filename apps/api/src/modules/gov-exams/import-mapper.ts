import { parseSaneDate } from "./scrape-validator";
import type { RecruitmentExtractionItem } from "./scrape-schemas";

// Maps one raw "vacancy" object from an admin-pasted JSON import (an
// AI-Overview-style export the admin generated themselves via ChatGPT or
// similar, in a { card, details, content } shape) into our own internal
// types. Deliberately defensive rather than schema-strict — this content
// comes from an external tool whose exact field set may drift between
// exports, so every read is a safe optional lookup, not a required key.

export type RawImportItem = Record<string, unknown>;

function obj(source: RawImportItem | undefined, key: string): RawImportItem | undefined {
  const v = source?.[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as RawImportItem) : undefined;
}

function str(source: RawImportItem | undefined, key: string): string | null {
  const v = source?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(source: RawImportItem | undefined, key: string): number | null {
  const v = source?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strArray(source: RawImportItem | undefined, key: string): string[] | undefined {
  const v = source?.[key];
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function numRecord(source: RawImportItem | undefined, key: string): Record<string, number> | undefined {
  const v = source?.[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as RawImportItem)) {
    if (typeof val === "number") out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Copying a link from a chat UI often carries markdown-link wrapping —
// "[display text](https://actual-url)" — instead of a plain URL. Takes the
// parenthesized target (the real href), not the bracket text, and drops
// anything that still doesn't parse as a URL rather than storing garbage.
const MARKDOWN_LINK = /^\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/;

export function normalizeImportUrl(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const match = trimmed.match(MARKDOWN_LINK);
  const candidate = match ? match[2] : trimmed;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

// Feeds validateRecruitmentItem()'s existing title/date/vacancy sanity
// checks — the same deterministic rules already applied to scraped items —
// so an imported item gets no special treatment just because it arrived as
// hand-pasted JSON instead of an AI extraction.
export function mapToExtractionItem(raw: RawImportItem): RecruitmentExtractionItem {
  const card = obj(raw, "card");
  const details = obj(raw, "details");
  const eligibility = obj(details, "eligibility");
  const application = obj(details, "application");
  const importantDates = obj(details, "important_dates");
  const officialLinks = obj(details, "official_links");

  return {
    // recruitment_name (e.g. "...Special Recruitment Drive for SC/ST/OBC
    // Backlog Vacancies") is preferred over job_title — several distinct
    // postings for the same organization commonly share an identical
    // job_title ("Junior Associate...") while only recruitment_name
    // actually distinguishes the drive, and title collisions become slug
    // collisions, which createRecruitment() treats as a duplicate to skip.
    title: str(details, "recruitment_name") ?? str(details, "job_title") ?? str(card, "job_title") ?? "",
    organizationName: str(details, "organization") ?? str(card, "organization"),
    totalVacancies: num(details, "vacancies") ?? num(card, "vacancies"),
    qualification: str(eligibility, "educational_qualification") ?? str(card, "qualification_short"),
    ageMin: num(eligibility, "age_min"),
    ageMax: num(eligibility, "age_max"),
    applicationStartDate: str(application, "start_date") ?? str(card, "application_start"),
    applicationEndDate: str(application, "end_date") ?? str(card, "application_end"),
    examDate: str(importantDates, "exam_date") ?? str(card, "exam_date"),
    officialNotificationUrl: normalizeImportUrl(str(officialLinks, "notification_url")) ?? null,
    applyUrl: normalizeImportUrl(str(officialLinks, "apply_url") ?? str(card, "apply_url")) ?? null,
  };
}

// Everything the JSON carries beyond what the scraper's extraction schema
// (and validateRecruitmentItem) already knows how to validate — passed
// through as optional, un-validated fields onto the richer GovRecruitment
// schema. Nothing here decides published/draft; that's still entirely
// validateRecruitmentItem's call, based on real applicationEndDate/examDate.
export interface RichRecruitmentFields {
  department?: string;
  advertisementNumber?: string;
  jobLocation?: string;
  localLanguageRequirement?: string;
  requiredExperience?: string;
  payScale?: string;
  basicPay?: string;
  salaryRange?: string;
  otherBenefits?: string;
  ageAsOnDate?: Date;
  paymentLastDate?: Date;
  correctionLastDate?: Date;
  prelimsDate?: Date;
  mainsDate?: Date;
  admitCardDate?: Date;
  resultDate?: Date;
  interviewDate?: Date;
  verificationStatus?: string;
  lastVerifiedAt?: Date;
  summary?: string;
  whoCanApply?: string;
  howToApply?: string;
  importantNote?: string;
  selectionProcess?: string[];
  applicationProcess?: string[];
  documentsRequired?: string[];
  highlights?: string[];
  examPattern?: { mode?: string; stages?: string[]; subjects?: string[]; duration?: string; negativeMarking?: string };
  postsByCategory?: Record<string, number>;
  postsByState?: Record<string, number>;
  applicationFee?: Record<string, number>;
  officialWebsiteUrl?: string;
  sourceUrl?: string;
}

export function mapToRichFields(raw: RawImportItem): RichRecruitmentFields {
  const details = obj(raw, "details");
  const content = obj(raw, "content");
  const eligibility = obj(details, "eligibility");
  const application = obj(details, "application");
  const importantDates = obj(details, "important_dates");
  const salary = obj(details, "salary");
  const examPatternRaw = obj(details, "exam_pattern");
  const officialLinks = obj(details, "official_links");
  const source = obj(details, "source");

  const examPattern = {
    mode: str(examPatternRaw, "mode") ?? undefined,
    stages: strArray(examPatternRaw, "stages"),
    subjects: strArray(examPatternRaw, "subjects"),
    duration: str(examPatternRaw, "duration") ?? undefined,
    negativeMarking: str(examPatternRaw, "negative_marking") ?? undefined,
  };
  const hasExamPattern = Object.values(examPattern).some((v) => v !== undefined);

  const rawFee = application?.["application_fee"];
  const applicationFee =
    typeof rawFee === "number" ? { general: rawFee } : numRecord(application, "application_fee");

  return {
    department: str(details, "department") ?? undefined,
    advertisementNumber: str(details, "advertisement_number") ?? undefined,
    jobLocation: str(details, "job_location") ?? undefined,
    localLanguageRequirement: str(details, "local_language_requirement") ?? undefined,
    requiredExperience: str(eligibility, "required_experience") ?? undefined,
    payScale: str(salary, "pay_scale") ?? undefined,
    basicPay: str(salary, "basic_pay") ?? undefined,
    salaryRange: str(salary, "salary_range") ?? undefined,
    otherBenefits: str(salary, "other_benefits") ?? undefined,
    ageAsOnDate: parseSaneDate(str(eligibility, "age_as_on_date")) ?? undefined,
    paymentLastDate: parseSaneDate(str(application, "payment_last_date")) ?? undefined,
    correctionLastDate: parseSaneDate(str(application, "correction_last_date")) ?? undefined,
    prelimsDate: parseSaneDate(str(importantDates, "prelims_date")) ?? undefined,
    mainsDate: parseSaneDate(str(importantDates, "mains_date")) ?? undefined,
    admitCardDate: parseSaneDate(str(importantDates, "admit_card_date")) ?? undefined,
    resultDate: parseSaneDate(str(importantDates, "result_date")) ?? undefined,
    interviewDate: parseSaneDate(str(importantDates, "interview_date")) ?? undefined,
    verificationStatus: str(source, "verification_status") ?? undefined,
    lastVerifiedAt: parseSaneDate(str(source, "last_verified_at")) ?? undefined,
    summary: str(content, "summary") ?? undefined,
    whoCanApply: str(content, "who_can_apply") ?? undefined,
    howToApply: str(content, "how_to_apply") ?? undefined,
    importantNote: str(content, "important_note") ?? undefined,
    selectionProcess: strArray(details, "selection_process"),
    applicationProcess: strArray(details, "application_process"),
    documentsRequired: strArray(details, "documents_required"),
    highlights: strArray(content, "highlights"),
    examPattern: hasExamPattern ? examPattern : undefined,
    postsByCategory: numRecord(details, "number_of_posts_by_category"),
    postsByState: numRecord(details, "number_of_posts_by_state"),
    applicationFee,
    officialWebsiteUrl: normalizeImportUrl(str(officialLinks, "official_recruitment_page")),
    sourceUrl: normalizeImportUrl(str(source, "source_url")),
  };
}
