import { apiClient } from "./client";

export type AiProviderType = "openai" | "groq" | "anthropic" | "google";
export type AiModelPurpose = "chat" | "reasoning" | "websearch" | "embedding";

export interface ProviderCapabilities {
  chat: boolean;
  streamingChat: boolean;
  embedding: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  vision: boolean;
  webSearch: boolean;
}

export interface ProviderStatus {
  provider: AiProviderType;
  configured: boolean;
  capabilities: ProviderCapabilities | undefined;
}

// Mirrors PURPOSE_REQUIRED_CAPABILITY in ai-settings.service.ts — used to
// filter the purpose-assignment picker down to compatible catalog entries
// before the admin ever tries to save an incompatible one.
export const PURPOSE_REQUIRED_CAPABILITY: Record<AiModelPurpose, keyof ProviderCapabilities> = {
  chat: "structuredOutput",
  reasoning: "structuredOutput",
  websearch: "webSearch",
  embedding: "embedding",
};

export interface ProviderModelOption {
  id: string;
  label: string;
}

export interface AiModelCatalogEntry {
  id: string;
  provider: AiProviderType;
  modelId: string;
  label: string;
  fallbackProvider: AiProviderType | null;
  fallbackModelId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelCatalogEntryInput {
  provider: AiProviderType;
  modelId: string;
  label: string;
  fallbackProvider?: AiProviderType;
  fallbackModelId?: string;
}

export interface AiModelAssignment {
  purpose: AiModelPurpose;
  modelEntryId: string;
  modelEntry: AiModelCatalogEntry;
  updatedAt: string;
}

const BASE = "/api/system/ai-settings";

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const { data } = await apiClient.get<ProviderStatus[]>(`${BASE}/providers`);
  return data;
}

export async function listProviderModels(provider: AiProviderType): Promise<ProviderModelOption[]> {
  const { data } = await apiClient.get<ProviderModelOption[]>(`${BASE}/providers/${provider}/models`);
  return data;
}

export async function listModelCatalog(): Promise<AiModelCatalogEntry[]> {
  const { data } = await apiClient.get<AiModelCatalogEntry[]>(`${BASE}/catalog`);
  return data;
}

export async function createModelCatalogEntry(input: AiModelCatalogEntryInput): Promise<AiModelCatalogEntry> {
  const { data } = await apiClient.post<AiModelCatalogEntry>(`${BASE}/catalog`, input);
  return data;
}

export async function updateModelCatalogEntry(id: string, input: Partial<AiModelCatalogEntryInput> & { enabled?: boolean }): Promise<AiModelCatalogEntry> {
  const { data } = await apiClient.patch<AiModelCatalogEntry>(`${BASE}/catalog/${id}`, input);
  return data;
}

export async function deleteModelCatalogEntry(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/catalog/${id}`);
}

export async function listModelAssignments(): Promise<AiModelAssignment[]> {
  const { data } = await apiClient.get<AiModelAssignment[]>(`${BASE}/assignments`);
  return data;
}

export async function setModelAssignment(purpose: AiModelPurpose, modelEntryId: string): Promise<AiModelAssignment> {
  const { data } = await apiClient.put<AiModelAssignment>(`${BASE}/assignments/${purpose}`, { modelEntryId });
  return data;
}
