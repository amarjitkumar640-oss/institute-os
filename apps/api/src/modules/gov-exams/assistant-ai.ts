import { z } from "zod";
import { PrismaCacheStore } from "../../lib/aiCacheStore";
import { getAppAIGateway } from "../../lib/aiGateway";
import { prisma } from "../../lib/prisma";
import * as govExams from "./gov-exams.service";

const CACHE_TTL_SECONDS = 1200; // 20 min — safety-net backstop; real invalidation happens via the cacheFreshnessKey (see routes.ts), not this number

// @amarjit_gts/universal-ai-sdk is a pure ESM package; apps/api compiles
// to CommonJS (see tsconfig.json), so it can't be a static top-level
// import — require() of a "type": "module" package throws ERR_REQUIRE_ESM.
// A dynamic import() works from CJS and TypeScript preserves it as a real
// dynamic import under module: "commonjs" (doesn't downlevel to require()).
type CreateAIModule = typeof import("@amarjit_gts/universal-ai-sdk");

const searchRecruitmentsTool = {
  name: "searchRecruitments",
  description: "Search government exam recruitments by keyword in their title. Returns up to 8 matches.",
  inputSchema: z.object({ keyword: z.string().min(1) }),
  permissions: [],
  riskLevel: "low" as const,
  timeoutMs: 5000,
  execute: async ({ keyword }: { keyword: string }) => {
    const results = await govExams.searchRecruitments(keyword);
    return results.map((r) => ({
      title: r.title,
      organization: r.organization,
      category: r.category,
      status: r.status,
      applyUrl: r.applyUrl,
      prelimsDate: r.prelimsDate,
      mainsDate: r.mainsDate,
    }));
  },
};

const listCurrentAffairsTool = {
  name: "listCurrentAffairs",
  description: "List recent published current affairs relevant to government exam prep, optionally filtered by category (e.g. 'national', 'sports', 'banking-finance').",
  inputSchema: z.object({
    category: z.string().optional(),
    limit: z.number().int().positive().max(20).optional(),
  }),
  permissions: [],
  riskLevel: "low" as const,
  timeoutMs: 5000,
  execute: async ({ category, limit }: { category?: string; limit?: number }) => {
    // Categories are admin-configurable at runtime (CurrentAffairCategory
    // table), so this can't be a static enum baked into the tool schema at
    // module-load time (this whole AI instance is memoized once per process
    // — see getAssistantAI below). Resolve the free-text key live; an
    // unmatched category silently drops the filter rather than erroring,
    // same tolerant style as the rest of this tool.
    const matched = category
      ? await prisma.currentAffairCategory.findFirst({ where: { key: category } })
      : null;

    const result = await govExams.listCurrentAffairs({
      categoryId: matched?.id,
      status: "published",
      page: 1,
      limit: limit ?? 5,
    });
    return result.data.map((c) => ({ title: c.title, category: c.category.key, publishedDate: c.publishedDate }));
  },
};

// Wraps the existing deterministic eligibility rule engine
// (gov-exams.service.ts's checkEligibility — its own comment says "never
// delegated to an LLM"). That principle holds here too: age comparisons
// with category relaxations are exact arithmetic across many rows — the
// model would be unreliable at this and inconsistent run-to-run if asked
// to filter itself. The model never computes eligibility; it only calls
// this tool and reports the REAL filtered results back.
const checkEligibilityTool = {
  name: "checkEligibility",
  description:
    "Find published recruitments a person is eligible for, given their age and optionally qualification/category. " +
    "Use this for any 'what can I apply for' or age/qualification-based question — never filter recruitments by age yourself.",
  inputSchema: z.object({
    age: z.number().int().positive(),
    qualification: z.string().optional(),
    category: z.string().optional(),
  }),
  permissions: [],
  riskLevel: "low" as const,
  timeoutMs: 5000,
  execute: async (input: { age: number; qualification?: string; category?: string }) => {
    const results = await govExams.checkEligibility(input);
    return results.map((r) => ({
      title: r.title,
      organization: r.organization,
      applyUrl: r.applyUrl,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      qualification: r.qualification,
    }));
  },
};

type UniversalAI = ReturnType<CreateAIModule["createAI"]>;

// Scopes the assistant to this app's real data and, just as importantly,
// tells it what to do when a question falls outside what its tools cover
// — say so honestly instead of inventing generic, ungrounded advice.
// Caught live: asked an eligibility question (before checkEligibilityTool
// existed), the model called the nearest tool badly and filled the gap
// with generic career-advice fluff.
const SYSTEM_PROMPT =
  "You are the Government Exam Intelligence assistant, used by institute admins to look up " +
  "government job recruitments and current affairs that are tracked in this system. " +
  "Only answer using information your tools return — never invent recruitment listings, dates, or " +
  "eligibility rules from general knowledge. If a question needs something none of your tools can " +
  "provide (e.g. a kind of filtering or analysis this system doesn't support yet), say plainly that " +
  "you don't have that capability right now, instead of giving generic advice unrelated to this system's " +
  "actual data.";

let aiPromise: Promise<UniversalAI> | undefined;

export async function getAssistantAI(): Promise<UniversalAI> {
  if (!aiPromise) {
    aiPromise = Promise.all([import("@amarjit_gts/universal-ai-sdk"), getAppAIGateway()]).then(([{ createAI }, aiGateway]) =>
      createAI({
        aiGateway,
        tools: [searchRecruitmentsTool, listCurrentAffairsTool, checkEligibilityTool],
        orchestrator: { enabled: true, maxSteps: 6, systemPrompt: SYSTEM_PROMPT },
        cache: { store: new PrismaCacheStore(), ttlSeconds: CACHE_TTL_SECONDS },
      }),
    );
  }
  return aiPromise;
}
