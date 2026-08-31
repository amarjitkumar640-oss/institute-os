import { resetDb } from "./setup";
import { validateCurrentAffairItem, validateRecruitmentItem } from "../modules/gov-exams/scrape-validator";
import type { RecruitmentExtractionItem, CurrentAffairExtractionItem } from "../modules/gov-exams/scrape-schemas";

beforeEach(async () => {
  await resetDb();
});

function recruitmentItem(overrides: Partial<RecruitmentExtractionItem> = {}): RecruitmentExtractionItem {
  return {
    title: "SSC CGL 2026",
    organizationName: null, totalVacancies: null, qualification: null, ageMin: null, ageMax: null,
    applicationStartDate: null, applicationEndDate: null, examDate: null, officialNotificationUrl: null, applyUrl: null,
    ...overrides,
  };
}

function currentAffairItem(overrides: Partial<CurrentAffairExtractionItem> = {}): CurrentAffairExtractionItem {
  return {
    title: "RBI Keeps Repo Rate Unchanged",
    whatHappened: "The RBI's monetary policy committee held the repo rate steady at 6.5%.",
    category: null, keyFacts: null, whyImportant: null, publishedDate: null,
    ...overrides,
  };
}

describe("validateRecruitmentItem", () => {
  it("is unusable when the title is missing or too short", () => {
    const result = validateRecruitmentItem(recruitmentItem({ title: "" }), { category: "ssc" });
    expect(result.outcome).toBe("unusable");

    const short = validateRecruitmentItem(recruitmentItem({ title: "SSC" }), { category: "ssc" });
    expect(short.outcome).toBe("unusable");
  });

  it("carries the category through directly and organizationName as plain display text", () => {
    const result = validateRecruitmentItem(
      recruitmentItem({ organizationName: "Staff Selection Commission", applicationEndDate: "2026-10-15" }),
      { category: "ssc" },
    );
    expect(result.outcome).not.toBe("unusable");
    if (result.outcome !== "unusable") {
      expect(result.input.category).toBe("ssc");
      expect(result.input.organization).toBe("Staff Selection Commission");
    }
  });

  it("leaves organization undefined rather than unusable when no organizationName is present", () => {
    const result = validateRecruitmentItem(recruitmentItem({ applicationEndDate: "2026-10-15" }), { category: "banking" });
    expect(result.outcome).not.toBe("unusable");
    if (result.outcome !== "unusable") expect(result.input.organization).toBeUndefined();
  });

  it("falls back to draft (with a reason) when neither applicationEndDate nor examDate is present", () => {
    const result = validateRecruitmentItem(recruitmentItem(), { category: "ssc" });
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/applicationEndDate|examDate/);
  });

  it("drops an out-of-range totalVacancies and falls back to draft rather than storing garbage", () => {
    const result = validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "2026-10-15", totalVacancies: -5 }),
      { category: "ssc" },
    );
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") {
      expect(result.input.totalVacancies).toBeUndefined();
      expect(result.reasons.join(" ")).toMatch(/totalVacancies/);
    }
  });

  it("publishes when the title and a valid date are present and sane", () => {
    const result = validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "2026-10-15", totalVacancies: 1200 }),
      { category: "ssc" },
    );
    expect(result.outcome).toBe("published");
  });

  it("rejects a garbage date year as invalid, not a real date", () => {
    const result = validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "3026-10-15" }),
      { category: "ssc" },
    );
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/applicationEndDate/);
  });
});

describe("validateCurrentAffairItem", () => {
  const categoryLookup = {
    categoryKeyToId: new Map([
      ["national", "cat-national-id"],
      ["banking-finance", "cat-banking-id"],
    ]),
    defaultCategoryId: "cat-national-id",
  };

  it("is unusable when title or whatHappened is missing/too short", () => {
    expect(validateCurrentAffairItem(currentAffairItem({ title: "" }), categoryLookup).outcome).toBe("unusable");
    expect(validateCurrentAffairItem(currentAffairItem({ whatHappened: "short" }), categoryLookup).outcome).toBe("unusable");
  });

  it("falls back to draft and defaults the category when none is extracted", () => {
    const result = validateCurrentAffairItem(currentAffairItem(), categoryLookup);
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") {
      expect(result.input.categoryId).toBe("cat-national-id");
      expect(result.reasons.join(" ")).toMatch(/category/);
    }
  });

  it("falls back to draft and defaults the category when the extracted key doesn't match any known category", () => {
    const result = validateCurrentAffairItem(currentAffairItem({ category: "some-deleted-category" }), categoryLookup);
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.input.categoryId).toBe("cat-national-id");
  });

  it("falls back to draft and defaults publishedDate when the extracted date is invalid", () => {
    const result = validateCurrentAffairItem(currentAffairItem({ category: "banking-finance", publishedDate: "not-a-date" }), categoryLookup);
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/publishedDate/);
  });

  it("publishes when title, whatHappened, category, and a valid date are all present", () => {
    const result = validateCurrentAffairItem(currentAffairItem({ category: "banking-finance", publishedDate: "2026-08-20" }), categoryLookup);
    expect(result.outcome).toBe("published");
    if (result.outcome === "published") expect(result.input.categoryId).toBe("cat-banking-id");
  });
});
