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
  it("matches an existing organization by name instead of flagging a new one", async () => {
    const org = await prisma.govOrganization.create({ data: { name: "Bank of Baroda", shortName: "BOB-TEST", type: "banking" } });
    const plan = await buildImportPlan([rawItem()], "banking");
    expect(plan).toHaveLength(1);
    const item = plan[0];
    if (item.outcome === "unusable") throw new Error("expected a usable outcome");
    expect(item.matchedOrganization?.id).toBe(org.id);
    expect(item.willCreateOrganization).toBe(false);
  });

  it("flags a new organization as unmatched when nothing resembles it", async () => {
    const plan = await buildImportPlan([rawItem({ organization: "Some New Bank Nobody Has Registered" })], "banking");
    const item = plan[0];
    if (item.outcome === "unusable") throw new Error("expected a usable outcome");
    expect(item.matchedOrganization).toBeNull();
    expect(item.willCreateOrganization).toBe(true);
  });

  it("is unusable when the JSON carries no organization name at all", async () => {
    const item = rawItem();
    delete (item.card as Record<string, unknown>).organization;
    delete (item.details as Record<string, unknown>).organization;
    const plan = await buildImportPlan([item], "banking");
    expect(plan[0].outcome).toBe("unusable");
  });
});

describe("commitRecruitmentImport", () => {
  it("creates one organization for a batch and reuses it across every item for the same org, instead of creating a duplicate per item", async () => {
    const items = [
      rawItem({ recruitmentName: "SBI Junior Associate — Regular" }),
      rawItem({ recruitmentName: "SBI Junior Associate — Special Drive" }),
      rawItem({ recruitmentName: "SBI Specialist Cadre Officer" }),
    ].map((i) => {
      (i.card as Record<string, unknown>).organization = "State Bank of India";
      (i.details as Record<string, unknown>).organization = "State Bank of India";
      return i;
    });

    const result = await commitRecruitmentImport(items, "banking");

    expect(result.created).toBe(3);
    expect(result.organizationsCreated).toBe(1);
    const orgs = await prisma.govOrganization.findMany({ where: { name: "State Bank of India" } });
    expect(orgs).toHaveLength(1);
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
