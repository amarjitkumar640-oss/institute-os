import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { normalizeImportUrl, mapToExtractionItem } from "../modules/gov-exams/import-mapper";
import { buildImportPlan, commitRecruitmentImport } from "../modules/gov-exams/gov-exams-import.service";
import type { RawImportItem } from "../modules/gov-exams/import-mapper";

beforeEach(async () => {
  await resetDb();
});

// Mirrors the shape of the sample JSON the admin actually pastes in — an
// AI-Overview-style export with { card, details, content } — trimmed to
// only the fields each test cares about.
function rawItem(overrides: Partial<{ organization: string; recruitmentName: string; jobTitle: string; applicationEndDate: string | null }> = {}): RawImportItem {
  return {
    card: { organization: overrides.organization ?? "Bank of Baroda", job_title: overrides.jobTitle ?? "Local Bank Officer" },
    details: {
      organization: overrides.organization ?? "Bank of Baroda",
      recruitment_name: overrides.recruitmentName ?? "Recruitment of Local Bank Officers on Regular Basis",
      job_title: overrides.jobTitle ?? "Local Bank Officer",
      application: { end_date: overrides.applicationEndDate === undefined ? "2026-10-15" : overrides.applicationEndDate },
      official_links: { apply_url: "[https://example.com/apply](https://example.com/apply)" },
    },
    content: {},
  };
}

describe("normalizeImportUrl", () => {
  it("unwraps a markdown-link-wrapped URL down to the actual href", () => {
    expect(normalizeImportUrl("[https://x.com/a](https://x.com/a)")).toBe("https://x.com/a");
    expect(normalizeImportUrl("[display text](https://x.com/b)")).toBe("https://x.com/b");
  });

  it("passes a plain URL through unchanged", () => {
    expect(normalizeImportUrl("https://x.com/c")).toBe("https://x.com/c");
  });

  it("drops a value that isn't a usable URL rather than storing garbage", () => {
    expect(normalizeImportUrl("not a url")).toBeUndefined();
    expect(normalizeImportUrl(null)).toBeUndefined();
  });
});

describe("mapToExtractionItem", () => {
  it("prefers details.recruitment_name over job_title for the title", () => {
    const item = mapToExtractionItem(rawItem({ recruitmentName: "Special Recruitment Drive", jobTitle: "Junior Associate" }));
    expect(item.title).toBe("Special Recruitment Drive");
  });
});

describe("buildImportPlan", () => {
  it("carries the dialog's selected category and the extracted organization straight onto the input", () => {
    const plan = buildImportPlan([rawItem()], "banking");
    expect(plan).toHaveLength(1);
    const item = plan[0];
    if (item.outcome === "unusable") throw new Error("expected a usable outcome");
    expect(item.recruitmentInput.category).toBe("banking");
    expect(item.recruitmentInput.organization).toBe("Bank of Baroda");
  });

  it("is usable (organization left undefined) even when the JSON carries no organization name at all", () => {
    const item = rawItem();
    delete (item.card as Record<string, unknown>).organization;
    delete (item.details as Record<string, unknown>).organization;
    const plan = buildImportPlan([item], "banking");
    const planItem = plan[0];
    expect(planItem.outcome).not.toBe("unusable");
    if (planItem.outcome !== "unusable") expect(planItem.recruitmentInput.organization).toBeUndefined();
  });

  it("is unusable when the title is missing", () => {
    const item = rawItem();
    delete (item.details as Record<string, unknown>).recruitment_name;
    delete (item.details as Record<string, unknown>).job_title;
    delete (item.card as Record<string, unknown>).job_title;
    const plan = buildImportPlan([item], "banking");
    expect(plan[0].outcome).toBe("unusable");
  });
});

describe("commitRecruitmentImport", () => {
  it("creates a recruitment with the selected category and no organization matching/creation", async () => {
    const result = await commitRecruitmentImport([rawItem()], "banking");
    expect(result.created).toBe(1);
    const recruitment = await prisma.govRecruitment.findFirstOrThrow({ where: { organization: "Bank of Baroda" } });
    expect(recruitment.category).toBe("banking");
  });

  it("publishes when a valid applicationEndDate is present, and skips a slug clash as a duplicate", async () => {
    const first = await commitRecruitmentImport([rawItem()], "banking");
    expect(first.created).toBe(1);
    expect(first.published).toBe(1);
    expect(first.items[0].outcome).toBe("created_published");

    const second = await commitRecruitmentImport([rawItem()], "banking");
    expect(second.created).toBe(0);
    expect(second.skippedDuplicates).toBe(1);
  });

  it("falls back to draft, not published, when no valid date is present", async () => {
    const result = await commitRecruitmentImport([rawItem({ applicationEndDate: null })], "banking");
    expect(result.items[0].outcome).toBe("created_draft");
  });
});
