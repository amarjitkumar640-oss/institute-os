import type { CachedRunEntry, CacheStore } from "@amarjit_gts/universal-ai-orchestrator";
import { prisma } from "./prisma";

/**
 * Postgres-backed CacheStore for @amarjit_gts/universal-ai-sdk's Orchestrator
 * cache (see ADR-007 in universal-ai-platform). Generic — not gov-exams-
 * specific — any future AI surface can pass this same instance to its own
 * createAI({cache}) call. No Redis client exists in this app yet (Valkey
 * runs in infra but nothing connects to it); this is the right scale for
 * today, and the interface is storage-agnostic, so a Redis implementation
 * can replace this later with zero SDK-side changes.
 */
export class PrismaCacheStore implements CacheStore {
  async get(key: string): Promise<CachedRunEntry | null> {
    const row = await prisma.aiAssistantCacheEntry.findFirst({
      where: { key, expiresAt: { gt: new Date() } },
    });
    return row ? (row.value as unknown as CachedRunEntry) : null;
  }

  async set(key: string, entry: CachedRunEntry, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await prisma.aiAssistantCacheEntry.upsert({
      where: { key },
      create: { key, value: entry as unknown as object, expiresAt },
      update: { value: entry as unknown as object, expiresAt },
    });
  }
}
