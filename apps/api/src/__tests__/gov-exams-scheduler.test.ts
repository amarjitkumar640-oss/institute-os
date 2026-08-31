import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { tick } from "../modules/gov-exams/gov-exams-scheduler";
import * as aiGateway from "../lib/aiGateway";
import * as firecrawl from "../lib/firecrawl";

jest.mock("../lib/aiGateway");
jest.mock("../lib/firecrawl");
const mockedWebSearchExtract = aiGateway.webSearchExtract as jest.MockedFunction<typeof aiGateway.webSearchExtract>;
const mockedScrapeUrlToMarkdown = firecrawl.scrapeUrlToMarkdown as jest.MockedFunction<typeof firecrawl.scrapeUrlToMarkdown>;

// tick() fires work fire-and-forget (same as modules/jobs/scheduler.ts,
// deliberately — the scheduler must not block its own next tick on a slow
// run). A fixed number of microtask flushes isn't reliable once real DB
// round-trips are in the chain, so poll for the condition instead.
async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}

// For asserting something did NOT happen — there's no "done" signal to poll
// for, so just give any accidental async work a real window to surface.
async function settle(ms = 250): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

beforeEach(async () => {
  await resetDb();
  mockedWebSearchExtract.mockReset();
  mockedScrapeUrlToMarkdown.mockReset();
});

describe("gov-exams-scheduler tick()", () => {
  it("does not fire a disabled source, even if it's never run before", async () => {
    await prisma.govSource.create({
      data: { category: "ssc", contentType: "recruitment", fetchMode: "url", label: "Test", url: "https://example.com", enabled: false },
    });

    await tick(prisma);
    await settle();

    expect(mockedScrapeUrlToMarkdown).not.toHaveBeenCalled();
  }, 10000);

  it("fires an enabled hourly source that has never run before", async () => {
    await prisma.govSource.create({
      data: { category: "ssc", contentType: "recruitment", fetchMode: "url", label: "Test", url: "https://example.com", enabled: true },
    });
    mockedScrapeUrlToMarkdown.mockResolvedValue(null);

    await tick(prisma);
    await waitFor(() => mockedScrapeUrlToMarkdown.mock.calls.length > 0);

    expect(mockedScrapeUrlToMarkdown).toHaveBeenCalledWith("https://example.com");
  }, 10000);

  it("does not re-fire an hourly source whose lastScrapedAt is within the current hour", async () => {
    const now = new Date();
    const withinThisHour = new Date(now);
    withinThisHour.setUTCMinutes(Math.min(now.getUTCMinutes(), 1), 0, 0);
    await prisma.govSource.create({
      data: {
        category: "ssc", contentType: "recruitment", fetchMode: "url", label: "Test", url: "https://example.com",
        enabled: true, lastScrapedAt: withinThisHour, lastScrapeStatus: "success",
      },
    });

    await tick(prisma);
    await settle();

    expect(mockedScrapeUrlToMarkdown).not.toHaveBeenCalled();
  }, 10000);

  it("fires an enabled job-vacancy prompt template that has never run before", async () => {
    await prisma.govJobVacancyPromptTemplate.create({ data: { category: "banking", prompt: "Search for banking jobs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { vacancies: [] }, citations: [], search: { content: "test search content", citations: [] } });

    await tick(prisma);
    await waitFor(async () => {
      const updated = await prisma.govJobVacancyPromptTemplate.findUniqueOrThrow({ where: { category: "banking" } });
      return updated.lastRunStatus !== null;
    });

    expect(mockedWebSearchExtract).toHaveBeenCalledTimes(1);
    const updated = await prisma.govJobVacancyPromptTemplate.findUniqueOrThrow({ where: { category: "banking" } });
    expect(updated.lastRunStatus).toBe("success");
  }, 10000);

  it("does not fire a disabled current-affairs template", async () => {
    await prisma.govCurrentAffairsPromptTemplate.create({ data: { id: "singleton", prompt: "Search for current affairs", enabled: false } });

    await tick(prisma);
    await settle();

    expect(mockedWebSearchExtract).not.toHaveBeenCalled();
  }, 10000);

  it("fires the current-affairs template when its daily schedule is due", async () => {
    // Default schedule is daily @ 06:00 IST with no lastRunAt — always due.
    await prisma.govCurrentAffairsPromptTemplate.create({ data: { id: "singleton", prompt: "Search for current affairs", enabled: true } });
    mockedWebSearchExtract.mockResolvedValue({ ok: true, data: { current_affairs: [] }, citations: [], search: { content: "test search content", citations: [] } });

    await tick(prisma);
    await waitFor(async () => {
      const updated = await prisma.govCurrentAffairsPromptTemplate.findUniqueOrThrow({ where: { id: "singleton" } });
      return updated.lastRunStatus !== null;
    });

    expect(mockedWebSearchExtract).toHaveBeenCalledTimes(1);
  }, 10000);
});
