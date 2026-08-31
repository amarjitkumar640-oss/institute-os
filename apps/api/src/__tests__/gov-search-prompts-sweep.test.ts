import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import {
  runSourceAndRecordStatus,
  runJobVacancyPromptTemplateAndRecordStatus,
  runCurrentAffairsPromptTemplateAndRecordStatus,
} from "../modules/gov-exams/gov-sources.service";
import * as aiGateway from "../lib/aiGateway";

jest.mock("../lib/aiGateway");
const mockedWebSearchExtract = aiGateway.webSearchExtract as jest.MockedFunction<typeof aiGateway.webSearchExtract>;

beforeEach(async () => {
  await resetDb();
  mockedWebSearchExtract.mockReset();
});

// One (unrealistically small) rich vacancy item, in the same { card,
// details, content } shape the real prompts (see BankingJobPrompt.md etc.)
// ask the LLM to return.
function vacancyItem(overrides: Partial<{ organization: string; jobTitle: string; applicationEndDate: string | null }> = {}) {
  return {
    card: { organization: overrides.organization ?? "State Bank of India", job_title: overrides.jobTitle ?? "Probationary Officer" },
    details: {
      organization: overrides.organization ?? "State Bank of India",
      recruitment_name: overrides.jobTitle ?? "Probationary Officer",
      application: { end_date: overrides.applicationEndDate === undefined ? "2026-10-15" : overrides.applicationEndDate },
    },
    content: {},
  };
}

function currentAffairItem(overrides: Partial<{ title: string; sourceUrl: string }> = {}) {
  return {
    card: { title: overrides.title ?? "RBI keeps repo rate unchanged", category: "banking-finance" },
    details: {
      title: overrides.title ?? "RBI keeps repo rate unchanged",
      category: "banking-finance",
      description: "The Reserve Bank of India's MPC voted to keep the repo rate unchanged.",
      event_date: "2026-08-20",
      organization: "Reserve Bank of India",
      source: overrides.sourceUrl ? { source_url: overrides.sourceUrl } : undefined,
    },
    content: {},
  };
}

describe("runJobVacancyPromptTemplateAndRecordStatus", () => {
  it("creates a recruitment with the template's category, and records success on the row", async () => {
    const template = await prisma.govJobVacancyPromptTemplate.create({ data: { category: "banking", prompt: "Search for banking jobs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { vacancies: [vacancyItem()] }, citations: [{ url: "https://sbi.co.in/careers" }], search: { content: "test search content", citations: [{ url: "https://sbi.co.in/careers" }] } });

    const outcome = await runJobVacancyPromptTemplateAndRecordStatus(template);

    expect(outcome.skipped).toBe(false);
    if (outcome.skipped) throw new Error("expected not skipped");
    expect(outcome.result.created).toBe(1);
    expect(outcome.result.published).toBe(1);

    const recruitment = await prisma.govRecruitment.findFirstOrThrow({ where: { organization: "State Bank of India" } });
    expect(recruitment.category).toBe("banking");
    expect(recruitment.source).toBe("scraped");

    const updated = await prisma.govJobVacancyPromptTemplate.findUniqueOrThrow({ where: { category: "banking" } });
    expect(updated.lastRunStatus).toBe("success");
    expect(updated.lastRunAt).not.toBeNull();
  });

  it("records the underlying error message when webSearchExtract fails, without throwing", async () => {
    const template = await prisma.govJobVacancyPromptTemplate.create({ data: { category: "railway", prompt: "Search for railway jobs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: false, error: "401 Unauthorized: invalid API key" });

    const outcome = await runJobVacancyPromptTemplateAndRecordStatus(template);

    expect(outcome.skipped).toBe(false);
    if (outcome.skipped) throw new Error("expected not skipped");
    expect(outcome.result.status).toBe("error");
    expect(outcome.result.error).toContain("401 Unauthorized: invalid API key");
    const updated = await prisma.govJobVacancyPromptTemplate.findUniqueOrThrow({ where: { category: "railway" } });
    expect(updated.lastRunStatus).toBe("error");
    expect(updated.lastRunError).toContain("401 Unauthorized: invalid API key");
  });

  it("skips with a reason when this category is already running", async () => {
    const template = await prisma.govJobVacancyPromptTemplate.create({ data: { category: "ssc", prompt: "Search for SSC jobs", enabled: true } });
    let resolveSearch!: (v: Awaited<ReturnType<typeof aiGateway.webSearchExtract>>) => void;
    mockedWebSearchExtract.mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }));

    const firstRun = runJobVacancyPromptTemplateAndRecordStatus(template);
    // Give the first call a tick to register itself as running before the second fires.
    await new Promise((r) => setImmediate(r));
    const secondOutcome = await runJobVacancyPromptTemplateAndRecordStatus(template);

    expect(secondOutcome.skipped).toBe(true);

    resolveSearch({ ok: true, data: { vacancies: [] }, citations: [], search: { content: "test search content", citations: [] } });
    await firstRun;
  });
});

describe("runSourceAndRecordStatus", () => {
  it("skips with a reason when this source is already running", async () => {
    const source = await prisma.govSource.create({
      data: { category: "ssc", contentType: "recruitment", fetchMode: "url", label: "Test", url: "https://example.com" },
    });
    // scrapeSource() for a url-mode source calls scrapeUrlToMarkdown, not
    // webSearchExtract — mock the module boundary it actually crosses.
    jest.spyOn(require("../lib/firecrawl"), "scrapeUrlToMarkdown").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("# Some page"), 50)),
    );

    const firstRun = runSourceAndRecordStatus(source);
    await new Promise((r) => setImmediate(r));
    const secondOutcome = await runSourceAndRecordStatus(source);

    expect(secondOutcome.skipped).toBe(true);
    await firstRun;
  });
});

describe("runCurrentAffairsPromptTemplateAndRecordStatus", () => {
  it("creates and publishes a current affair, and records success on the row", async () => {
    const template = await prisma.govCurrentAffairsPromptTemplate.create({ data: { id: "singleton", prompt: "Search for current affairs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { current_affairs: [currentAffairItem()] }, citations: [{ url: "https://rbi.org.in" }], search: { content: "test search content", citations: [{ url: "https://rbi.org.in" }] } });

    const outcome = await runCurrentAffairsPromptTemplateAndRecordStatus(template);

    expect(outcome.skipped).toBe(false);
    if (outcome.skipped) throw new Error("expected not skipped");
    expect(outcome.result.created).toBe(1);
    expect(outcome.result.published).toBe(1);

    const currentAffair = await prisma.govCurrentAffair.findFirstOrThrow({ where: { organization: "Reserve Bank of India" } });
    expect(currentAffair.source).toBe("scraped");

    const updated = await prisma.govCurrentAffairsPromptTemplate.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(updated.lastRunStatus).toBe("success");
  });

  it("injects today's date into the query, and lastRunAt context on a subsequent run", async () => {
    let template = await prisma.govCurrentAffairsPromptTemplate.create({ data: { id: "singleton", prompt: "Search for current affairs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { current_affairs: [] }, citations: [], search: { content: "test search content", citations: [] } });

    await runCurrentAffairsPromptTemplateAndRecordStatus(template);
    const firstQuery = mockedWebSearchExtract.mock.calls[0][0].query;
    const today = new Date().toISOString().slice(0, 10);
    expect(firstQuery).toContain(`Today's date is ${today}`);
    expect(firstQuery).not.toContain("last run on");

    template = await prisma.govCurrentAffairsPromptTemplate.findUniqueOrThrow({ where: { id: "singleton" } });
    await runCurrentAffairsPromptTemplateAndRecordStatus(template);
    const secondQuery = mockedWebSearchExtract.mock.calls[1][0].query;
    expect(secondQuery).toContain(`Today's date is ${today}`);
    expect(secondQuery).toContain(`last run on ${today}`);
  });

  it("skips creating a duplicate when the item's sourceUrl matches an existing current affair, even with a different title", async () => {
    const template = await prisma.govCurrentAffairsPromptTemplate.create({ data: { id: "singleton", prompt: "Search for current affairs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValueOnce({
      ok: true,
      data: { current_affairs: [currentAffairItem({ sourceUrl: "https://rbi.org.in/notification-123" })] },
      citations: [],
      search: { content: "test search content", citations: [] },
    });
    const first = await runCurrentAffairsPromptTemplateAndRecordStatus(template);
    if (first.skipped) throw new Error("expected not skipped");
    expect(first.result.created).toBe(1);

    // Same real-world event, paraphrased title (as a re-run LLM search
    // would likely produce), same underlying source URL.
    mockedWebSearchExtract.mockResolvedValueOnce({
      ok: true,
      data: { current_affairs: [currentAffairItem({ title: "RBI holds repo rate steady again", sourceUrl: "https://rbi.org.in/notification-123" })] },
      citations: [],
      search: { content: "test search content", citations: [] },
    });
    const updated = await prisma.govCurrentAffairsPromptTemplate.findUniqueOrThrow({ where: { id: "singleton" } });
    const second = await runCurrentAffairsPromptTemplateAndRecordStatus(updated);
    if (second.skipped) throw new Error("expected not skipped");

    expect(second.result.created).toBe(0);
    const all = await prisma.govCurrentAffair.findMany({ where: { sourceUrl: "https://rbi.org.in/notification-123" } });
    expect(all).toHaveLength(1);
  });
});
