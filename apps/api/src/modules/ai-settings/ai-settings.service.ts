import type { ProviderCapabilities } from "@amarjit_gts/universal-ai-ai-core";
import type { AiModelPurpose, AiProviderType } from "@prisma/client";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";

// @amarjit_gts/universal-ai-ai-core is a pure ESM package; apps/api
// compiles to CommonJS (see tsconfig.json), so getProviderCapabilities
// (a value, unlike the type-only import above) can't be a static
// top-level import — same reason gov-exams/assistant-ai.ts and
// lib/aiGateway.ts dynamically import @amarjit_gts/universal-ai-sdk /
// @amarjit_gts/universal-ai-ai-core instead of a static require().
type AICoreModule = typeof import("@amarjit_gts/universal-ai-ai-core");
let getProviderCapabilitiesFn: AICoreModule["getProviderCapabilities"] | undefined;
async function loadGetProviderCapabilities(): Promise<AICoreModule["getProviderCapabilities"]> {
  if (!getProviderCapabilitiesFn) {
    ({ getProviderCapabilities: getProviderCapabilitiesFn } = await import("@amarjit_gts/universal-ai-ai-core"));
  }
  return getProviderCapabilitiesFn;
}

const PROVIDER_ENV_KEYS: Record<AiProviderType, keyof typeof env> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};

const ALL_PROVIDERS: AiProviderType[] = ["openai", "groq", "anthropic", "google"];

// Which ProviderCapabilities flag a purpose actually needs — chat/reasoning
// both drive the orchestrator's plan/arg-fill/synthesis calls, all of
// which use structuredOutput() (strict JSON schema mode), so a provider
// without that support would break every internal call, not just this
// one purpose. See ADR-002 Addendum 2 in universal-ai-platform for why
// this is provider-level, hand-curated data, not something queryable
// from any provider's own API.
const PURPOSE_REQUIRED_CAPABILITY: Record<AiModelPurpose, keyof ProviderCapabilities> = {
  chat: "structuredOutput",
  reasoning: "structuredOutput",
  websearch: "webSearch",
  embedding: "embedding",
};

/** Never returns key values — just whether each provider's env var is set, plus its (hand-curated, static) capability flags for the AI Models picker to filter on. */
export async function getProviderStatus(): Promise<{ provider: AiProviderType; configured: boolean; capabilities: ProviderCapabilities | undefined }[]> {
  const getProviderCapabilities = await loadGetProviderCapabilities();
  return ALL_PROVIDERS.map((provider) => ({
    provider,
    configured: env[PROVIDER_ENV_KEYS[provider]] !== "",
    capabilities: getProviderCapabilities(provider),
  }));
}

export interface ProviderModelOption {
  id: string;
  label: string;
}

// OpenAI and Groq both expose the same OpenAI-compatible /v1/models shape.
async function listOpenAiCompatibleModels(baseUrl: string, apiKey: string): Promise<ProviderModelOption[]> {
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: { id: string }[] };
  return body.data
    .map((m) => ({ id: m.id, label: m.id }))
    .filter((m) => !/whisper|tts|dall-e|moderation/i.test(m.id)) // irrelevant to chat/reasoning/websearch/embedding
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listAnthropicModels(apiKey: string): Promise<ProviderModelOption[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: { id: string; display_name: string }[] };
  return body.data.map((m) => ({ id: m.id, label: m.display_name })).sort((a, b) => a.label.localeCompare(b.label));
}

async function listGoogleModels(apiKey: string): Promise<ProviderModelOption[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { models: { name: string; displayName: string }[] };
  return body.models
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function listProviderModels(provider: AiProviderType): Promise<{ ok: true; models: ProviderModelOption[] } | { ok: false; error: string }> {
  const envKey = PROVIDER_ENV_KEYS[provider];
  const apiKey = env[envKey] as string;
  if (!apiKey) return { ok: false, error: `${envKey} is not configured` };

  try {
    const models =
      provider === "openai"
        ? await listOpenAiCompatibleModels("https://api.openai.com/v1", apiKey)
        : provider === "groq"
          ? await listOpenAiCompatibleModels("https://api.groq.com/openai/v1", apiKey)
          : provider === "anthropic"
            ? await listAnthropicModels(apiKey)
            : await listGoogleModels(apiKey);
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: `Failed to fetch models from ${provider}: ${(error as Error).message}` };
  }
}

export function listCatalog() {
  return prisma.aiModelCatalogEntry.findMany({ orderBy: { createdAt: "asc" } });
}

export interface CatalogEntryInput {
  provider: AiProviderType;
  modelId: string;
  label: string;
  fallbackProvider?: AiProviderType;
  fallbackModelId?: string;
}

export function createCatalogEntry(input: CatalogEntryInput) {
  return prisma.aiModelCatalogEntry.create({ data: input });
}

export function updateCatalogEntry(id: string, input: Partial<CatalogEntryInput> & { enabled?: boolean }) {
  return prisma.aiModelCatalogEntry.update({ where: { id }, data: input });
}

export async function deleteCatalogEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const inUse = await prisma.aiModelAssignment.findFirst({ where: { modelEntryId: id } });
  if (inUse) return { ok: false, error: `Still assigned to the "${inUse.purpose}" purpose — unassign it first` };
  await prisma.aiModelCatalogEntry.delete({ where: { id } });
  return { ok: true };
}

export function listAssignments() {
  return prisma.aiModelAssignment.findMany({ include: { modelEntry: true } });
}

export async function setAssignment(purpose: AiModelPurpose, modelEntryId: string): Promise<{ ok: true; assignment: unknown } | { ok: false; error: string }> {
  const entry = await prisma.aiModelCatalogEntry.findUnique({ where: { id: modelEntryId } });
  if (!entry) return { ok: false, error: "Model catalog entry not found" };
  if (!entry.enabled) return { ok: false, error: "Cannot assign a disabled model — enable it first" };

  const requiredCapability = PURPOSE_REQUIRED_CAPABILITY[purpose];
  const getProviderCapabilities = await loadGetProviderCapabilities();
  const providerCapabilities = getProviderCapabilities(entry.provider);
  if (!providerCapabilities?.[requiredCapability]) {
    return { ok: false, error: `${entry.provider} does not support ${requiredCapability}, required for the "${purpose}" purpose` };
  }

  const assignment = await prisma.aiModelAssignment.upsert({
    where: { purpose },
    create: { purpose, modelEntryId },
    update: { modelEntryId },
    include: { modelEntry: true },
  });
  return { ok: true, assignment };
}
