import type { GovOrgType } from "@prisma/client";
import * as govExams from "./gov-exams.service";
import type { RecruitmentInput } from "./gov-exams.service";
import { mapToExtractionItem, mapToRichFields, type RawImportItem } from "./import-mapper";
import { validateRecruitmentItem } from "./scrape-validator";

// Manual JSON import — an admin pastes an AI-Overview-style export (see
// import-mapper.ts for the expected { card, details, content } shape) and
// this turns it into GovRecruitment rows, reusing the exact same
// deterministic validateRecruitmentItem() rules the scraper uses so an
// imported item is held to the same bar. Two-step preview/commit (unlike
// the scraper's fully-automated sweep) because this is a synchronous,
// admin-triggered batch the admin should get to review before anything is
// written — see gov-exams-import.routes.ts.
//
// The admin's selected category is authoritative for every item in the
// batch — organization is just extracted display text, carried through
// unvalidated (see scrape-validator.ts / GovRecruitment.organization).

export type ImportPlanItem =
  | {
      index: number;
      outcome: "unusable";
      reason: string;
      title: string;
    }
  | {
      index: number;
      outcome: "draft" | "published";
      reasons?: string[];
      title: string;
      recruitmentInput: Omit<RecruitmentInput, "source" | "sourceUrl">;
      sourceUrl?: string;
    };

export function buildImportPlan(rawItems: RawImportItem[], category: GovOrgType): ImportPlanItem[] {
  const plan: ImportPlanItem[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    const extractionItem = mapToExtractionItem(raw);
    const validation = validateRecruitmentItem(extractionItem, { category });

    if (validation.outcome === "unusable") {
      plan.push({ index, outcome: "unusable", reason: validation.reason, title: extractionItem.title || "(untitled)" });
      continue;
    }

    const { sourceUrl, ...richFields } = mapToRichFields(raw);

    plan.push({
      index,
      outcome: validation.outcome,
      reasons: validation.outcome === "draft" ? validation.reasons : undefined,
      title: validation.input.title,
      recruitmentInput: { ...validation.input, ...richFields },
      sourceUrl,
    });
  }

  return plan;
}

export interface ImportCommitResult {
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
  items: {
    index: number;
    title: string;
    outcome: "created_published" | "created_draft" | "skipped_duplicate" | "unusable";
    reason?: string;
    recruitmentId?: string;
  }[];
}

export async function commitRecruitmentImport(rawItems: RawImportItem[], category: GovOrgType): Promise<ImportCommitResult> {
  const plan = buildImportPlan(rawItems, category);

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;
  const items: ImportCommitResult["items"] = [];

  for (const planItem of plan) {
    if (planItem.outcome === "unusable") {
      unusable++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "unusable", reason: planItem.reason });
      continue;
    }

    // createRecruitment() already rejects on slug clash — that IS the
    // dedupe check, same convention as the scraper's sweep.
    const result = await govExams.createRecruitment({
      ...planItem.recruitmentInput,
      source: "manual",
      sourceUrl: planItem.sourceUrl,
    });
    if (!result.ok) {
      skippedDuplicates++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "skipped_duplicate" });
      continue;
    }
    created++;

    if (planItem.outcome === "published") {
      await govExams.setRecruitmentStatus(result.recruitment.id, "published");
      published++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "created_published", recruitmentId: result.recruitment.id });
    } else {
      items.push({ index: planItem.index, title: planItem.title, outcome: "created_draft", recruitmentId: result.recruitment.id });
    }
  }

  return { created, published, skippedDuplicates, unusable, items };
}
