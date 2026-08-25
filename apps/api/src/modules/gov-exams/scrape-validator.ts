import { prisma } from "../../lib/prisma";
import { slugify } from "../../lib/slugify";
import type { CurrentAffairInput, RecruitmentInput } from "./gov-exams.service";
import type { CurrentAffairExtractionItem, RecruitmentExtractionItem } from "./scrape-schemas";

// Deterministic, rule-based validation — never delegated to the AI, same
// principle as checkEligibility() in gov-exams.service.ts. An item that
// fails a rule still gets created (as draft, for admin review) rather than
// silently discarded; only a genuinely unusable item (no title, no
// resolvable organization) is skipped entirely. True duplicates aren't
// checked here — createRecruitment()/createCurrentAffair() already reject
// on slug clash, which the sweep treats as "already exists, skip".

const MIN_YEAR = 2020;
const MAX_YEAR = 2035;

// Exported for reuse by the manual JSON import (gov-exams-import.service.ts),
// which has its own extra date fields (prelims/mains/admit card/etc.) beyond
// what this file's own item shapes carry, but wants the exact same sanity
// rules applied to all of them.
export function parseSaneDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return date;
}

export interface RecruitmentValidationContext {
  /** From the GovSource row, if the admin configured one. */
  organizationId?: string;
}

export type RecruitmentValidationResult =
  | { outcome: "unusable"; reason: string }
  | { outcome: "draft"; input: Omit<RecruitmentInput, "source" | "sourceUrl">; reasons: string[] }
  | { outcome: "published"; input: Omit<RecruitmentInput, "source" | "sourceUrl"> };

export async function validateRecruitmentItem(
  item: RecruitmentExtractionItem,
  ctx: RecruitmentValidationContext,
): Promise<RecruitmentValidationResult> {
  const title = item.title?.trim();
  if (!title || title.length < 5 || title.length > 300) {
    return { outcome: "unusable", reason: "Missing or unusable title" };
  }

  let organizationId = ctx.organizationId;
  if (!organizationId && item.organizationName) {
    const match = await prisma.govOrganization.findFirst({
      where: {
        OR: [
          { name: { equals: item.organizationName, mode: "insensitive" } },
          { shortName: { equals: item.organizationName, mode: "insensitive" } },
        ],
      },
    });
    organizationId = match?.id;
  }
  if (!organizationId) {
    return { outcome: "unusable", reason: "Could not resolve an organization for this recruitment" };
  }

  const reasons: string[] = [];

  const applicationStartDate = parseSaneDate(item.applicationStartDate) ?? undefined;
  const applicationEndDate = parseSaneDate(item.applicationEndDate) ?? undefined;
  const examDate = parseSaneDate(item.examDate) ?? undefined;
  if (item.applicationEndDate && !applicationEndDate) reasons.push("applicationEndDate did not parse to a valid date");
  if (item.examDate && !examDate) reasons.push("examDate did not parse to a valid date");
  if (!applicationEndDate && !examDate) reasons.push("No valid applicationEndDate or examDate found");

  let totalVacancies = item.totalVacancies ?? undefined;
  if (totalVacancies != null && (totalVacancies <= 0 || totalVacancies > 10_000_000)) {
    reasons.push(`totalVacancies (${totalVacancies}) is out of a sane range — dropped`);
    totalVacancies = undefined;
  }

  const input: Omit<RecruitmentInput, "source" | "sourceUrl"> = {
    organizationId,
    title,
    slug: slugify(title),
    totalVacancies,
    qualification: item.qualification ?? undefined,
    ageMin: item.ageMin ?? undefined,
    ageMax: item.ageMax ?? undefined,
    applicationStartDate,
    applicationEndDate,
    examDate,
    officialNotificationUrl: item.officialNotificationUrl ?? undefined,
    applyUrl: item.applyUrl ?? undefined,
  };

  return reasons.length > 0 ? { outcome: "draft", input, reasons } : { outcome: "published", input };
}

export type CurrentAffairValidationResult =
  | { outcome: "unusable"; reason: string }
  | { outcome: "draft"; input: Omit<CurrentAffairInput, "source" | "sourceUrl">; reasons: string[] }
  | { outcome: "published"; input: Omit<CurrentAffairInput, "source" | "sourceUrl"> };

export function validateCurrentAffairItem(item: CurrentAffairExtractionItem): CurrentAffairValidationResult {
  const title = item.title?.trim();
  const whatHappened = item.whatHappened?.trim();
  if (!title || title.length < 5 || !whatHappened || whatHappened.length < 10) {
    return { outcome: "unusable", reason: "Missing or unusable title/whatHappened" };
  }

  const reasons: string[] = [];

  const parsedDate = parseSaneDate(item.publishedDate);
  if (item.publishedDate && !parsedDate) reasons.push("publishedDate did not parse to a valid date — defaulted to today");
  const publishedDate = parsedDate ?? new Date();

  const category = item.category;
  if (!category) reasons.push("No category extracted — defaulted to 'national'");

  const input: Omit<CurrentAffairInput, "source" | "sourceUrl"> = {
    title,
    slug: slugify(title),
    category: category ?? "national",
    whatHappened,
    keyFacts: item.keyFacts ?? undefined,
    whyImportant: item.whyImportant ?? undefined,
    publishedDate,
  };

  return reasons.length > 0 ? { outcome: "draft", input, reasons } : { outcome: "published", input };
}
