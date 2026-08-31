import * as categories from "./current-affair-categories.service";
import * as govExams from "./gov-exams.service";
import type { CurrentAffairInput } from "./gov-exams.service";
import { mapToCurrentAffairExtractionItem, mapToCurrentAffairRichFields } from "./current-affairs-import-mapper";
import type { RawImportItem } from "./import-mapper";
import { validateCurrentAffairItem, type CurrentAffairCategoryLookup } from "./scrape-validator";

// Manual JSON import for current affairs — mirrors gov-exams-import.service.ts's
// recruitment import exactly (two-step preview/commit, reusing the same
// deterministic validateCurrentAffairItem() rules the scraper uses), except
// there is no dialog-level category selector: each item already self-declares
// its own category in the pasted JSON (see CurrentAffairsPrompt.md), so it's
// matched per item against the live CurrentAffairCategory table — same
// lookup/fallback the scraper already uses, not a parallel mechanism.

export type CurrentAffairImportPlanItem =
  | { index: number; outcome: "unusable"; reason: string; title: string }
  | {
      index: number;
      outcome: "draft" | "published";
      reasons?: string[];
      title: string;
      matchedCategoryKey: string | null;
      currentAffairInput: Omit<CurrentAffairInput, "source" | "sourceUrl">;
    };

export async function buildCurrentAffairImportPlan(rawItems: RawImportItem[]): Promise<CurrentAffairImportPlanItem[]> {
  const [allCategories, defaultCategory] = await Promise.all([
    categories.listVisibleCategories(),
    categories.getDefaultCategory(),
  ]);
  if (!defaultCategory) {
    throw new Error("No current-affair categories configured");
  }
  const lookup: CurrentAffairCategoryLookup = {
    categoryKeyToId: new Map(allCategories.map((c) => [c.key, c.id])),
    defaultCategoryId: defaultCategory.id,
  };

  const plan: CurrentAffairImportPlanItem[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    const extractionItem = mapToCurrentAffairExtractionItem(raw);
    const validation = validateCurrentAffairItem(extractionItem, lookup);

    if (validation.outcome === "unusable") {
      plan.push({ index, outcome: "unusable", reason: validation.reason, title: extractionItem.title || "(untitled)" });
      continue;
    }

    const rich = mapToCurrentAffairRichFields(raw);
    plan.push({
      index,
      outcome: validation.outcome,
      reasons: validation.outcome === "draft" ? validation.reasons : undefined,
      title: validation.input.title,
      matchedCategoryKey: extractionItem.category,
      currentAffairInput: { ...validation.input, ...rich },
    });
  }

  return plan;
}

export interface CurrentAffairImportCommitResult {
  created: number;
  published: number;
  skippedDuplicates: number;
  unusable: number;
  items: {
    index: number;
    title: string;
    outcome: "created_published" | "created_draft" | "skipped_duplicate" | "unusable";
    reason?: string;
    currentAffairId?: string;
  }[];
}

export async function commitCurrentAffairImport(rawItems: RawImportItem[]): Promise<CurrentAffairImportCommitResult> {
  const plan = await buildCurrentAffairImportPlan(rawItems);

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;
  const items: CurrentAffairImportCommitResult["items"] = [];

  for (const planItem of plan) {
    if (planItem.outcome === "unusable") {
      unusable++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "unusable", reason: planItem.reason });
      continue;
    }

    // createCurrentAffair() already rejects on slug clash — that IS the
    // dedupe check, same convention as the scraper's sweep and the
    // recruitment import.
    const result = await govExams.createCurrentAffair({ ...planItem.currentAffairInput, source: "manual" });
    if (!result.ok) {
      skippedDuplicates++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "skipped_duplicate" });
      continue;
    }
    created++;

    if (planItem.outcome === "published") {
      await govExams.setCurrentAffairStatus(result.currentAffair.id, "published");
      published++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "created_published", currentAffairId: result.currentAffair.id });
    } else {
      items.push({ index: planItem.index, title: planItem.title, outcome: "created_draft", currentAffairId: result.currentAffair.id });
    }
  }

  return { created, published, skippedDuplicates, unusable, items };
}
