import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { mapToCurrentAffairExtractionItem, mapToCurrentAffairRichFields } from "../modules/gov-exams/current-affairs-import-mapper";
import { buildCurrentAffairImportPlan, commitCurrentAffairImport } from "../modules/gov-exams/current-affairs-import.service";
import type { RawImportItem } from "../modules/gov-exams/import-mapper";

beforeEach(async () => {
  await resetDb();
});

// Mirrors the { card, details, content } shape CurrentAffairsPrompt.md
// asks the LLM to return, trimmed to the fields each test cares about.
function rawItem(overrides: Partial<{ title: string; category: string; description: string; eventDate: string | null }> = {}): RawImportItem {
  return {
    card: { title: overrides.title ?? "RBI keeps repo rate unchanged", category: overrides.category ?? "banking-finance" },
    details: {
      title: overrides.title ?? "RBI keeps repo rate unchanged",
      category: overrides.category ?? "banking-finance",
      description: overrides.description ?? "The Reserve Bank of India's MPC voted to keep the repo rate unchanged at its latest meeting.",
      why_important: "Directly relevant for banking-sector exam current affairs.",
      key_facts: ["Repo rate held at 6.5%", "MPC voted 5-1"],
      event_date: overrides.eventDate === undefined ? "2026-08-20" : overrides.eventDate,
      level: "national",
      importance: "high",
      organization: "Reserve Bank of India",
      status: "current",
      exam_relevance: { ssc: false, banking: true, railway: false, other: [] },
      numbers: { percentage: 6.5 },
      source: { verification_status: "verified", source_url: "https://rbi.org.in/notification" },
    },
    content: { summary: "RBI's MPC held the repo rate steady.", highlights: ["Repo rate: 6.5%"] },
  };
}

describe("mapToCurrentAffairExtractionItem", () => {
  it("maps the thin fields validateCurrentAffairItem needs", () => {
    const item = mapToCurrentAffairExtractionItem(rawItem());
    expect(item.title).toBe("RBI keeps repo rate unchanged");
    expect(item.category).toBe("banking-finance");
    expect(item.whatHappened).toContain("Reserve Bank of India");
    expect(item.keyFacts).toEqual(["Repo rate held at 6.5%", "MPC voted 5-1"]);
    expect(item.publishedDate).toBe("2026-08-20");
  });
});

describe("mapToCurrentAffairRichFields", () => {
  it("extracts typed-essential fields and exam relevance flags", () => {
    const rich = mapToCurrentAffairRichFields(rawItem());
    expect(rich.level).toBe("national");
    expect(rich.importance).toBe("high");
    expect(rich.organization).toBe("Reserve Bank of India");
    expect(rich.newsStatus).toBe("current");
    expect(rich.verificationStatus).toBe("verified");
    expect(rich.sourceUrl).toBe("https://rbi.org.in/notification");
    expect(rich.examRelevance).toEqual({ ssc: false, banking: true, railway: false, other: [] });
  });

  it("carries the long-tail fields into richData rather than dropping them", () => {
    const rich = mapToCurrentAffairRichFields(rawItem());
    expect(rich.richData).toMatchObject({
      numbers: { percentage: 6.5 },
      summary: "RBI's MPC held the repo rate steady.",
      highlights: ["Repo rate: 6.5%"],
    });
  });
});

describe("buildCurrentAffairImportPlan", () => {
  it("matches each item's own category against the live CurrentAffairCategory table", async () => {
    const plan = await buildCurrentAffairImportPlan([rawItem()]);
    const item = plan[0];
    if (item.outcome === "unusable") throw new Error("expected a usable outcome");
    expect(item.matchedCategoryKey).toBe("banking-finance");
    const bankingCategory = await prisma.currentAffairCategory.findUniqueOrThrow({ where: { key: "banking-finance" } });
    expect(item.currentAffairInput.categoryId).toBe(bankingCategory.id);
  });

  it("falls back to the default category with a warning reason when the category key doesn't match", async () => {
    const plan = await buildCurrentAffairImportPlan([rawItem({ category: "not-a-real-category" })]);
    const item = plan[0];
    if (item.outcome === "unusable") throw new Error("expected a usable outcome");
    expect(item.outcome).toBe("draft");
    expect(item.reasons?.some((r) => r.includes("category"))).toBe(true);
  });

  it("is unusable when title/whatHappened are missing", async () => {
    const plan = await buildCurrentAffairImportPlan([rawItem({ description: "" })]);
    expect(plan[0].outcome).toBe("unusable");
  });
});

describe("commitCurrentAffairImport", () => {
  it("creates a published current affair with rich fields populated", async () => {
    const result = await commitCurrentAffairImport([rawItem()]);
    expect(result.created).toBe(1);
    expect(result.published).toBe(1);

    const created = await prisma.govCurrentAffair.findUniqueOrThrow({ where: { id: result.items[0].currentAffairId! } });
    expect(created.organization).toBe("Reserve Bank of India");
    expect(created.level).toBe("national");
    expect((created.richData as Record<string, unknown>)?.summary).toBe("RBI's MPC held the repo rate steady.");
  });

  it("skips a slug clash as a duplicate", async () => {
    const first = await commitCurrentAffairImport([rawItem()]);
    expect(first.created).toBe(1);

    const second = await commitCurrentAffairImport([rawItem()]);
    expect(second.created).toBe(0);
    expect(second.skippedDuplicates).toBe(1);
  });
});
