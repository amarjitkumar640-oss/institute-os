import type { ModelConfigProvider, ModelRegistryEntry } from "@amarjit_gts/universal-ai-ai-core";
import type { AiModelPurpose } from "@prisma/client";
import { prisma } from "./prisma";

const PURPOSE_TO_LOGICAL_NAME: Record<AiModelPurpose, string> = {
  chat: "default-chat",
  reasoning: "reasoning-strong",
  websearch: "web-search-chat",
  embedding: "default-embedding",
};

/**
 * Postgres-backed ModelConfigProvider for @amarjit_gts/universal-ai-ai-core's
 * dynamic model registry (see ADR-007 Addendum 5 in universal-ai-platform).
 * Platform-wide (no tenantId — matches JobConfig's precedent), admin-
 * configurable via the "AI Models" settings tab. Only returns entries for
 * purposes that have an explicit AiModelAssignment row — an unassigned
 * purpose falls through to ai-core's own static env-based default, so
 * this ships with zero forced admin action and zero day-one behavior
 * change. Only enabled catalog entries are ever returned.
 */
export class PrismaModelConfigProvider implements ModelConfigProvider {
  async loadEntries(): Promise<ModelRegistryEntry[]> {
    const assignments = await prisma.aiModelAssignment.findMany({
      where: { modelEntry: { enabled: true } },
      include: { modelEntry: true },
    });
    return assignments.map((a) => ({
      name: PURPOSE_TO_LOGICAL_NAME[a.purpose],
      provider: a.modelEntry.provider,
      modelId: a.modelEntry.modelId,
      capability: "chat" as const,
      fallback:
        a.modelEntry.fallbackProvider && a.modelEntry.fallbackModelId
          ? { provider: a.modelEntry.fallbackProvider, modelId: a.modelEntry.fallbackModelId }
          : undefined,
    }));
  }
}
