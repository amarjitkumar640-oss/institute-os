import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { AssistantSurface } from "./ai-assistant.types";

const SESSION_LIST_LIMIT = 50;
const TITLE_MAX_LENGTH = 60;

export async function listSessions(params: { tenantId: string; staffId: string; surface: AssistantSurface }) {
  return prisma.aiAssistantSession.findMany({
    where: { tenantId: params.tenantId, staffId: params.staffId, surface: params.surface },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: SESSION_LIST_LIMIT,
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
}

export async function createSession(params: { tenantId: string; staffId: string; surface: AssistantSurface }) {
  return prisma.aiAssistantSession.create({
    data: { tenantId: params.tenantId, staffId: params.staffId, surface: params.surface },
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
}

/** Cheap ownership check — id only, doesn't fetch the message thread. */
export async function findOwnedSession(params: { tenantId: string; staffId: string; sessionId: string }) {
  return prisma.aiAssistantSession.findFirst({
    where: { id: params.sessionId, tenantId: params.tenantId, staffId: params.staffId },
    select: { id: true },
  });
}

export async function getSessionWithMessages(params: { tenantId: string; staffId: string; sessionId: string }) {
  return prisma.aiAssistantSession.findFirst({
    where: { id: params.sessionId, tenantId: params.tenantId, staffId: params.staffId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, role: true, content: true, contentBlocks: true, mechanism: true, toolCalls: true, createdAt: true,
          aiRequestId: true, promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true,
        },
      },
    },
  });
}

export async function deleteSession(params: { tenantId: string; staffId: string; sessionId: string }): Promise<boolean> {
  const result = await prisma.aiAssistantSession.deleteMany({
    where: { id: params.sessionId, tenantId: params.tenantId, staffId: params.staffId },
  });
  return result.count > 0;
}

export interface AppendTurnParams {
  sessionId: string;
  question: string;
  answer: string;
  answerBlocks: Prisma.InputJsonValue;
  mechanism: string;
  toolCalls: { toolName: string; status: string }[];
  /** Same requestId passed to ai.run() — correlates this turn to its full per-call usage breakdown in @amarjit_gts/universal-ai-database's UsageRecord table. */
  requestId: string;
  /** Undefined when served from cache (no new AI call was made) — the assistant row's cost columns stay null in that case. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number };
}

/** One user row + one assistant row per turn — appended whether the answer came from a real AI call or the SDK's cache. */
export async function appendTurn(params: AppendTurnParams): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const userMessage = await tx.aiAssistantMessage.create({
      data: { sessionId: params.sessionId, role: "user", content: params.question },
    });
    await tx.aiAssistantMessage.create({
      data: {
        sessionId: params.sessionId,
        role: "assistant",
        content: params.answer,
        contentBlocks: params.answerBlocks,
        replyToId: userMessage.id,
        mechanism: params.mechanism,
        toolCalls: params.toolCalls,
        aiRequestId: params.requestId,
        promptTokens: params.usage?.promptTokens,
        completionTokens: params.usage?.completionTokens,
        totalTokens: params.usage?.totalTokens,
        estimatedCostUsd: params.usage?.estimatedCostUsd,
      },
    });

    const session = await tx.aiAssistantSession.findUniqueOrThrow({ where: { id: params.sessionId }, select: { title: true } });
    await tx.aiAssistantSession.update({
      where: { id: params.sessionId },
      data: {
        lastMessageAt: new Date(),
        title: session.title ?? params.question.slice(0, TITLE_MAX_LENGTH),
      },
    });
  });
}
