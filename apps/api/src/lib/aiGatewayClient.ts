import type { z } from "zod";
import { env } from "./env";

// zod-to-json-schema's generic return-type inference is too deep for tsc to
// resolve against the gov-exams extraction schemas' nesting (an object
// containing an array of ~9-field nullable objects) — hits "type
// instantiation is excessively deep" in a full `tsc -p` build. A documented
// upstream TS/zod-to-json-schema limitation for schemas at this nesting
// depth, not something restructuring the call fixes (verified: the runtime
// call itself is correct, tested live against Groq). Importing via a
// manually-typed require() sidesteps type inference on the call entirely,
// rather than fighting tsc's generic resolution — and unlike a type-check
// suppression comment, it doesn't produce a mismatched "unused directive"
// error under ts-jest's separate, per-file isolated compilation.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const zodToJsonSchemaUntyped: (schema: z.ZodTypeAny) => Record<string, unknown> = require("zod-to-json-schema").zodToJsonSchema;

// Calls universal-ai-platform's AI Gateway over HTTP (POST /api/v1/structured)
// — a separate repo/service, not an imported package; see the plan notes on
// why. institute-os defines its own Zod schemas locally and converts them to
// JSON Schema itself, so this file is the ONLY place that knows about the
// gateway's HTTP contract. Same lazy-init-and-warn-once, return-null-when-
// unconfigured convention as lib/email.ts — an unconfigured gateway degrades
// to "scraping does nothing" rather than crashing the server.
let _warnedUnconfigured = false;

function isConfigured(): boolean {
  if (env.AI_GATEWAY_URL && env.AI_GATEWAY_API_KEY) return true;
  if (!_warnedUnconfigured) {
    _warnedUnconfigured = true;
    console.warn("[aiGatewayClient] AI_GATEWAY_URL/AI_GATEWAY_API_KEY not configured — structured extraction will not run.");
  }
  return false;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface StructuredExtractOptions<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
}

// A separate, non-generic function so the call site's own generic T never
// enters zod-to-json-schema's type resolution — same pattern ai-core's own
// zodSchemaToJsonSchema() uses.
function zodToPlainJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchemaUntyped(schema);
}

/**
 * Extracts structured data matching `schema` from `messages` via the AI
 * Gateway service. Returns null if the gateway isn't configured or the call
 * fails (network error, or the model's output never validated after the
 * gateway's own retry) — callers treat that the same as "couldn't extract
 * anything from this source right now," logged by the caller, not thrown.
 */
export async function extractStructured<T>(options: StructuredExtractOptions<T>): Promise<T | null> {
  if (!isConfigured()) return null;

  const jsonSchema = zodToPlainJsonSchema(options.schema);

  let response: Response;
  try {
    response = await fetch(`${env.AI_GATEWAY_URL}/api/v1/structured`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        messages: options.messages,
        jsonSchema,
        schemaName: options.schemaName,
      }),
    });
  } catch (e) {
    console.error("[aiGatewayClient] request failed:", e);
    return null;
  }

  if (!response.ok) {
    console.error(`[aiGatewayClient] gateway returned ${response.status}:`, await response.text().catch(() => ""));
    return null;
  }

  const body = (await response.json()) as { data: unknown };
  const parsed = options.schema.safeParse(body.data);
  if (!parsed.success) {
    // The gateway already validated against the JSON Schema it derived from
    // this same schema — a mismatch here would mean the two representations
    // diverged, not a model error. Worth a loud log if it ever happens.
    console.error("[aiGatewayClient] gateway response failed local schema re-check:", parsed.error.issues);
    return null;
  }
  return parsed.data;
}

export interface Citation {
  url: string;
  title?: string;
}

interface WebSearchExtractOptions<T> {
  query: string;
  schema: z.ZodType<T>;
  schemaName: string;
}

export interface WebSearchExtractResult<T> {
  data: T;
  citations: Citation[];
}

/**
 * Searches the web for `query` via the AI Gateway's native web search (the
 * provider searches and reads pages on its own infrastructure — no page
 * content ever touches this app), then extracts structured data matching
 * `schema` from the synthesized answer. Same null-on-unconfigured/failure
 * convention as extractStructured().
 */
export async function webSearchExtract<T>(options: WebSearchExtractOptions<T>): Promise<WebSearchExtractResult<T> | null> {
  if (!isConfigured()) return null;

  const jsonSchema = zodToPlainJsonSchema(options.schema);

  let response: Response;
  try {
    response = await fetch(`${env.AI_GATEWAY_URL}/api/v1/web-search-structured`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        query: options.query,
        jsonSchema,
        schemaName: options.schemaName,
      }),
    });
  } catch (e) {
    console.error("[aiGatewayClient] web-search request failed:", e);
    return null;
  }

  if (!response.ok) {
    console.error(`[aiGatewayClient] web-search gateway returned ${response.status}:`, await response.text().catch(() => ""));
    return null;
  }

  const body = (await response.json()) as { data: unknown; citations?: Citation[] };
  const parsed = options.schema.safeParse(body.data);
  if (!parsed.success) {
    console.error("[aiGatewayClient] web-search gateway response failed local schema re-check:", parsed.error.issues);
    return null;
  }
  return { data: parsed.data, citations: body.citations ?? [] };
}
