import type { z } from "zod";
import type { AICoreConfig, AIGateway, ChatMessage, Citation } from "@amarjit_gts/universal-ai-ai-core";
import { PrismaModelConfigProvider } from "./aiModelConfigProvider";

// @amarjit_gts/universal-ai-ai-core is a pure ESM package; apps/api
// compiles to CommonJS (see tsconfig.json), so it can't be a static
// top-level import for its runtime values — same reason
// gov-exams/assistant-ai.ts dynamically imports @amarjit_gts/universal-ai-sdk.
type AICoreModule = typeof import("@amarjit_gts/universal-ai-ai-core");

const MODEL_CONFIG_REFRESH_MS = 60_000;

// Purpose-based model routing (see PrismaModelConfigProvider) is
// process-wide, not gov-exams-specific — one shared AIGateway instance
// for the whole api process, not one per AI feature, so every future AI
// surface picks up the same admin-configured routing.
let gatewayPromise: Promise<AIGateway> | undefined;

export async function getAppAIGateway(): Promise<AIGateway> {
  if (!gatewayPromise) {
    gatewayPromise = (import("@amarjit_gts/universal-ai-ai-core") as Promise<AICoreModule>).then(
      ({ aiCoreConfigFromEnv, aiCoreEnvSchema, createAIGateway }) => {
        const env = aiCoreEnvSchema.parse(process.env);
        const config: AICoreConfig = {
          ...aiCoreConfigFromEnv(env),
          modelConfigProvider: { provider: new PrismaModelConfigProvider(), refreshIntervalMs: MODEL_CONFIG_REFRESH_MS },
        };
        return createAIGateway(config);
      },
    );
  }
  return gatewayPromise;
}

export type { ChatMessage, Citation };

interface StructuredExtractOptions<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
}

export type AIGatewayResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Errors bubbling out of the AI SDK can be arbitrarily large (full response
// bodies, stack-shaped messages) — this is surfaced directly in the admin UI
// as the job's error detail, so cap it to something a badge/tooltip can hold.
const MAX_ERROR_MESSAGE_LENGTH = 500;

function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : message;
}

/**
 * Extracts structured data matching `schema` from `messages`, via the same
 * shared in-process AIGateway as every other AI surface in this app — see
 * getAppAIGateway()'s own comment for why this must never be a second,
 * independent AI implementation (e.g. a raw HTTP client to a different
 * process). Returns `{ ok: false, error }` on failure (model/provider error,
 * or the response never validated) — callers treat that as "couldn't
 * extract anything from this source right now," and can surface `error`
 * (the real message, e.g. "401 unauthorized" or "provider not configured")
 * instead of guessing at a cause. Always logged here too, never thrown.
 */
export async function extractStructured<T>(options: StructuredExtractOptions<T>): Promise<AIGatewayResult<T>> {
  try {
    const gateway = await getAppAIGateway();
    const data = await gateway.structuredOutput(options);
    return { ok: true, data };
  } catch (e) {
    console.error("[aiGateway] structured extraction failed:", e);
    return { ok: false, error: describeError(e) };
  }
}

interface WebSearchExtractOptions<T> {
  query: string;
  schema: z.ZodType<T>;
  schemaName: string;
  // Skips the web search call entirely and extracts straight from this
  // already-fetched answer instead — for retrying a schema/extraction fix
  // against a real prior search without paying for (and waiting on) a new
  // one. Caller is responsible for having cached `search` from a previous
  // `ok: false` result's own `search` field (see GovJobVacancyPromptTemplate's
  // lastSearchContent/lastSearchCitations for where gov-sources.service.ts
  // persists it).
  cachedSearch?: { content: string; citations: Citation[] };
}

// `search` carries the raw web-search answer regardless of ok/error — so a
// caller can always cache it (e.g. GovJobVacancyPromptTemplate.lastSearchContent)
// and later retry just the extraction step via `cachedSearch` without
// paying for a new search. Absent from the error branch only when the
// search call itself is what failed (nothing to cache in that case).
export type WebSearchExtractResult<T> =
  | { ok: true; data: T; citations: Citation[]; search: { content: string; citations: Citation[] } }
  | { ok: false; error: string; search?: { content: string; citations: Citation[] } };

// Neither AIGateway call has a built-in timeout, and a hung provider request
// previously looked identical to "still working" from the caller's side —
// no error, no log, nothing — for however long the underlying HTTP client
// was willing to wait (or forever, for a true hang). This turns that into a
// clear, bounded failure instead.
//
// The two calls get very different budgets on purpose. Web search with
// OpenAI's web_search tool genuinely fetches and reads multiple pages before
// it can answer — confirmed on this exact deployment via OpenAI's own usage
// dashboard showing a completed ~116K-input-token response for one search,
// which cannot happen fast. A short timeout here doesn't make a slow search
// fail faster; it just discards a real, billed answer that was still on its
// way — Promise.race doesn't cancel the underlying request, so a too-short
// timeout here is pure waste: OpenAI keeps working (and the org keeps
// getting billed) for a response nothing will ever use. The extraction call
// has no such excuse — it's a plain text-in/JSON-out completion — so it
// keeps a tight budget instead of masking a real hang there.
const WEB_SEARCH_TIMEOUT_MS = 240_000;
const EXTRACTION_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// Long enough to judge whether a query was well-formed, short enough that
// this doesn't itself become the thing bloating logs — the full query is
// still logged, just not repeated at every subsequent line.
const LOG_PREVIEW_LENGTH = 300;

function preview(text: string): string {
  return text.length > LOG_PREVIEW_LENGTH ? `${text.slice(0, LOG_PREVIEW_LENGTH)}…` : text;
}

/**
 * Searches the web for `query` via the "web-search-chat" logical model
 * (AI_WEBSEARCH_PROVIDER/AI_WEBSEARCH_MODEL, or an admin-configured
 * AiModelAssignment override — see PrismaModelConfigProvider), then
 * extracts structured data matching `schema` from the synthesized answer.
 * Always two AIGateway calls, never one combined call — native-web-search +
 * structured-output-in-one-call is only confirmed reliable for a subset of
 * providers/models. Same error-carrying convention as extractStructured().
 *
 * Every call is logged before it's sent (exact model + full prompt content,
 * not just a preview) and after it resolves or times out (elapsed ms +
 * response shape) — this is the only place either request is visible at
 * all, since the underlying SDK doesn't log its own HTTP traffic.
 */
export async function webSearchExtract<T>(options: WebSearchExtractOptions<T>): Promise<WebSearchExtractResult<T>> {
  const gateway = await getAppAIGateway();

  let searchResponse: { content: string; citations?: Citation[] };
  if (options.cachedSearch) {
    console.log("[aiGateway] web search skipped — using cached search content", {
      schemaName: options.schemaName,
      contentLength: options.cachedSearch.content.length,
      citationCount: options.cachedSearch.citations.length,
    });
    searchResponse = options.cachedSearch;
  } else {
    console.log("[aiGateway] web search request", {
      model: "web-search-chat",
      schemaName: options.schemaName,
      query: options.query,
    });
    const searchStartedAt = Date.now();
    try {
      searchResponse = await withTimeout(
        gateway.chat({
          messages: [{ role: "user", content: options.query }],
          webSearch: true,
          model: "web-search-chat",
        }),
        "web search chat call",
        WEB_SEARCH_TIMEOUT_MS,
      );
    } catch (e) {
      console.error("[aiGateway] web search chat call failed", {
        elapsedMs: Date.now() - searchStartedAt,
        error: e,
      });
      return { ok: false, error: describeError(e) };
    }
    console.log("[aiGateway] web search chat call resolved", {
      elapsedMs: Date.now() - searchStartedAt,
      contentLength: searchResponse.content.length,
      contentPreview: preview(searchResponse.content),
      citationCount: searchResponse.citations?.length ?? 0,
    });
  }

  const searchResult = { content: searchResponse.content, citations: searchResponse.citations ?? [] };

  const extractionMessage = `Extract structured data matching the requested schema from this answer:\n\n${searchResponse.content}`;
  console.log("[aiGateway] structured extraction request", {
    schemaName: options.schemaName,
    prompt: extractionMessage,
  });
  const extractStartedAt = Date.now();
  try {
    const data = await withTimeout(
      gateway.structuredOutput({
        messages: [{ role: "user", content: extractionMessage }],
        schema: options.schema,
        schemaName: options.schemaName,
      }),
      "structured extraction call",
      EXTRACTION_TIMEOUT_MS,
    );
    console.log("[aiGateway] structured extraction resolved", {
      elapsedMs: Date.now() - extractStartedAt,
    });
    return { ok: true, data, citations: searchResult.citations, search: searchResult };
  } catch (e) {
    console.error("[aiGateway] structured extraction failed", {
      elapsedMs: Date.now() - extractStartedAt,
      error: e,
    });
    return { ok: false, error: describeError(e), search: searchResult };
  }
}
