import type { GovOrgType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
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
// Organization matching is import-specific and intentionally more lenient
// than the scraper's (which requires an exact name/shortName match and
// otherwise discards the item as unusable): a human reviews the preview
// before committing, so an unmatched organization here just means "will
// create a new GovOrganization" rather than "drop this item" — safe only
// because commit never runs unattended.

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface OrgLite {
  id: string;
  name: string;
  shortName: string;
}

function matchOrganization(jsonName: string, orgs: OrgLite[]): OrgLite | null {
  const target = normalizeForMatch(jsonName);
  const byShortName = orgs.find((o) => normalizeForMatch(o.shortName) === target);
  if (byShortName) return byShortName;
  return (
    orgs.find((o) => {
      const n = normalizeForMatch(o.name);
      return n === target || n.includes(target) || target.includes(n);
    }) ?? null
  );
}

const STOP_WORDS = new Set(["of", "the", "and", "for", "on", "in"]);

function deriveShortNameCandidate(name: string): string {
  const initials = name
    .replace(/[^A-Za-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (initials.length >= 2) return initials.slice(0, 20);
  const fallback = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 20).toUpperCase();
  return fallback || "ORG";
}

async function deriveUniqueShortName(name: string): Promise<string> {
  const base = deriveShortNameCandidate(name);
  let candidate = base;
  let suffix = 2;
  while (await prisma.govOrganization.findUnique({ where: { shortName: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

export type ImportPlanItem =
  | {
      index: number;
      outcome: "unusable";
      reason: string;
      title: string;
      organizationNameFromJson: string | null;
    }
  | {
      index: number;
      outcome: "draft" | "published";
      reasons?: string[];
      title: string;
      organizationNameFromJson: string;
      matchedOrganization: { id: string; name: string } | null;
      willCreateOrganization: boolean;
      recruitmentInput: Omit<RecruitmentInput, "organizationId" | "source" | "sourceUrl">;
      sourceUrl?: string;
    };

export async function buildImportPlan(rawItems: RawImportItem[], category: GovOrgType): Promise<ImportPlanItem[]> {
  const orgs = await prisma.govOrganization.findMany({ select: { id: true, name: true, shortName: true } });
  const plan: ImportPlanItem[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    const extractionItem = mapToExtractionItem(raw);
    const orgName = extractionItem.organizationName;

    if (!orgName) {
      plan.push({
        index,
        outcome: "unusable",
        reason: "No organization name found in the JSON for this item",
        title: extractionItem.title || "(untitled)",
        organizationNameFromJson: null,
      });
      continue;
    }

    const matched = matchOrganization(orgName, orgs);
    // Always pass a truthy organizationId so validateRecruitmentItem skips
    // its own (stricter, exact-match) org resolution — the real id (matched
    // or newly created) gets substituted in at commit time.
    const validation = await validateRecruitmentItem(extractionItem, { organizationId: matched?.id ?? "pending" });

    if (validation.outcome === "unusable") {
      plan.push({
        index,
        outcome: "unusable",
        reason: validation.reason,
        title: extractionItem.title || "(untitled)",
        organizationNameFromJson: orgName,
      });
      continue;
    }

    const rich = mapToRichFields(raw);
    const { sourceUrl, ...richFields } = rich;
    const { organizationId: _placeholder, ...restInput } = validation.input;

    plan.push({
      index,
      outcome: validation.outcome,
      reasons: validation.outcome === "draft" ? validation.reasons : undefined,
      title: validation.input.title,
      organizationNameFromJson: orgName,
      matchedOrganization: matched ? { id: matched.id, name: matched.name } : null,
      willCreateOrganization: !matched,
      recruitmentInput: { ...restInput, ...richFields },
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
  organizationsCreated: number;
  items: {
    index: number;
    title: string;
    outcome: "created_published" | "created_draft" | "skipped_duplicate" | "unusable";
    reason?: string;
    recruitmentId?: string;
  }[];
}

export async function commitRecruitmentImport(rawItems: RawImportItem[], category: GovOrgType): Promise<ImportCommitResult> {
  const plan = await buildImportPlan(rawItems, category);

  let created = 0;
  let published = 0;
  let skippedDuplicates = 0;
  let unusable = 0;
  let organizationsCreated = 0;
  const items: ImportCommitResult["items"] = [];

  // buildImportPlan() resolves organizations against a single snapshot taken
  // before any of this batch's items are processed, so several items for
  // the same new organization (e.g. four SBI postings in one paste) all
  // come back "will create" independently. Tracked here so the batch
  // creates that organization once and every later item in the same commit
  // reuses it, instead of creating SBI, SBI-2, SBI-3, SBI-4.
  const createdOrgsByName = new Map<string, string>();

  for (const planItem of plan) {
    if (planItem.outcome === "unusable") {
      unusable++;
      items.push({ index: planItem.index, title: planItem.title, outcome: "unusable", reason: planItem.reason });
      continue;
    }

    let organizationId = planItem.matchedOrganization?.id;
    if (!organizationId) {
      const key = normalizeForMatch(planItem.organizationNameFromJson);
      organizationId = createdOrgsByName.get(key);
    }
    if (!organizationId) {
      const shortName = await deriveUniqueShortName(planItem.organizationNameFromJson);
      const org = await prisma.govOrganization.create({
        data: { name: planItem.organizationNameFromJson, shortName, type: category },
      });
      organizationId = org.id;
      organizationsCreated++;
      createdOrgsByName.set(normalizeForMatch(planItem.organizationNameFromJson), organizationId);
    }

    // createRecruitment() already rejects on slug clash — that IS the
    // dedupe check, same convention as the scraper's sweep.
    const result = await govExams.createRecruitment({
      ...planItem.recruitmentInput,
      organizationId,
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

  return { created, published, skippedDuplicates, unusable, organizationsCreated, items };
}
