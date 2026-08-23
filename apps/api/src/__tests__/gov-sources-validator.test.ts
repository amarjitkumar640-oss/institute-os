import { prisma } from "../lib/prisma";
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
    applicationStartDate: null, applicationEndDate: null, examDate: null, officialNotificationUrl: null,
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
  it("is unusable when the title is missing or too short", async () => {
    const result = await validateRecruitmentItem(recruitmentItem({ title: "" }), {});
    expect(result.outcome).toBe("unusable");

    const short = await validateRecruitmentItem(recruitmentItem({ title: "SSC" }), {});
    expect(short.outcome).toBe("unusable");
  });

  it("uses the source's organizationId directly when provided, without needing organizationName", async () => {
    const result = await validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "2026-10-15" }),
      { organizationId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(result.outcome).not.toBe("unusable");
    if (result.outcome !== "unusable") expect(result.input.organizationId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("resolves an organization by name (case-insensitive) when the source has no organizationId", async () => {
    const org = await prisma.govOrganization.create({
      data: { name: "Staff Selection Commission", shortName: "SSC-TEST", type: "ssc" },
    });

    const result = await validateRecruitmentItem(
      recruitmentItem({ organizationName: "staff selection commission", applicationEndDate: "2026-10-15" }),
      {},
    );
    expect(result.outcome).not.toBe("unusable");
    if (result.outcome !== "unusable") expect(result.input.organizationId).toBe(org.id);
  });

  it("is unusable when no organizationId is configured and no matching organization is found", async () => {
    const result = await validateRecruitmentItem(
      recruitmentItem({ organizationName: "Some Org That Does Not Exist", applicationEndDate: "2026-10-15" }),
      {},
    );
    expect(result).toEqual({ outcome: "unusable", reason: expect.stringContaining("organization") });
  });

  it("falls back to draft (with a reason) when neither applicationEndDate nor examDate is present", async () => {
    const result = await validateRecruitmentItem(recruitmentItem(), { organizationId: "11111111-1111-1111-1111-111111111111" });
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/applicationEndDate|examDate/);
  });

  it("drops an out-of-range totalVacancies and falls back to draft rather than storing garbage", async () => {
    const result = await validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "2026-10-15", totalVacancies: -5 }),
      { organizationId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") {
      expect(result.input.totalVacancies).toBeUndefined();
      expect(result.reasons.join(" ")).toMatch(/totalVacancies/);
    }
  });

  it("publishes when the title, organization, and a valid date are all present and sane", async () => {
    const result = await validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "2026-10-15", totalVacancies: 1200 }),
      { organizationId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(result.outcome).toBe("published");
  });

  it("rejects a garbage date year as invalid, not a real date", async () => {
    const result = await validateRecruitmentItem(
      recruitmentItem({ applicationEndDate: "3026-10-15" }),
      { organizationId: "11111111-1111-1111-1111-111111111111" },
    );
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/applicationEndDate/);
  });
});

describe("validateCurrentAffairItem", () => {
  it("is unusable when title or whatHappened is missing/too short", () => {
    expect(validateCurrentAffairItem(currentAffairItem({ title: "" })).outcome).toBe("unusable");
    expect(validateCurrentAffairItem(currentAffairItem({ whatHappened: "short" })).outcome).toBe("unusable");
  });

  it("falls back to draft and defaults the category when none is extracted", () => {
    const result = validateCurrentAffairItem(currentAffairItem());
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") {
      expect(result.input.category).toBe("national");
      expect(result.reasons.join(" ")).toMatch(/category/);
    }
  });

  it("falls back to draft and defaults publishedDate when the extracted date is invalid", () => {
    const result = validateCurrentAffairItem(currentAffairItem({ category: "banking", publishedDate: "not-a-date" }));
    expect(result.outcome).toBe("draft");
    if (result.outcome === "draft") expect(result.reasons.join(" ")).toMatch(/publishedDate/);
  });

  it("publishes when title, whatHappened, category, and a valid date are all present", () => {
    const result = validateCurrentAffairItem(currentAffairItem({ category: "banking", publishedDate: "2026-08-20" }));
    expect(result.outcome).toBe("published");
  });
});
