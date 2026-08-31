import crypto from "crypto";
import { Router } from "express";
import type { ResponseBlock } from "@amarjit_gts/universal-ai-sdk";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { prisma } from "../../lib/prisma";
import * as assistant from "../ai-assistant/ai-assistant.service";
import { getSiteTenant } from "../site/site.service";
import { getAssistantAI } from "./assistant-ai";

export const govExamsAssistantRouter = Router();

const SURFACE = "gov_exams_admin" as const;

// Same admin+tenant gate as every other gov-exams admin router.
govExamsAssistantRouter.use(requireAuth, requireRole("admin"));
govExamsAssistantRouter.use(async (req, res, next) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });
  next();
});

// ── Sessions ──────────────────────────────────────────────────────────────────

govExamsAssistantRouter.get("/sessions", async (req, res) => {
  const sessions = await assistant.listSessions({ tenantId: req.auth!.tenantId, staffId: req.auth!.staffId, surface: SURFACE });
  res.json({ sessions });
});

govExamsAssistantRouter.post("/sessions", async (req, res) => {
  const session = await assistant.createSession({ tenantId: req.auth!.tenantId, staffId: req.auth!.staffId, surface: SURFACE });
  res.status(201).json(session);
});

govExamsAssistantRouter.get("/sessions/:sessionId", validateUuidParam("sessionId"), async (req, res) => {
  const session = await assistant.getSessionWithMessages({ tenantId: req.auth!.tenantId, staffId: req.auth!.staffId, sessionId: req.params.sessionId });
  if (!session) return res.status(404).json({ error: "Not found" });
  res.json(session);
});

govExamsAssistantRouter.delete("/sessions/:sessionId", validateUuidParam("sessionId"), async (req, res) => {
  const deleted = await assistant.deleteSession({ tenantId: req.auth!.tenantId, staffId: req.auth!.staffId, sessionId: req.params.sessionId });
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ── Ask ───────────────────────────────────────────────────────────────────────

const askSchema = z.object({ question: z.string().min(1).max(500) });

govExamsAssistantRouter.post("/sessions/:sessionId/messages", validateUuidParam("sessionId"), validateBody(askSchema), async (req, res) => {
  const owned = await assistant.findOwnedSession({ tenantId: req.auth!.tenantId, staffId: req.auth!.staffId, sessionId: req.params.sessionId });
  if (!owned) return res.status(404).json({ error: "Not found" });

  const meta = await prisma.govExamsMeta.findUnique({ where: { id: "singleton" } });
  const cacheFreshnessKey = meta?.lastDataChangeAt.toISOString();

  const requestId = crypto.randomUUID();
  const ai = await getAssistantAI();
  const result = await ai.run({
    userMessages: [{ role: "user", content: req.body.question }],
    context: { grantedPermissions: [] },
    cacheFreshnessKey,
    requestId,
  });

  const toolCalls = result.steps.map((s) => ({ toolName: s.toolName, status: s.result.status }));
  const answer = result.status === "error" ? "Sorry, I couldn't process that question." : result.finalResponse;
  const answerBlocks: ResponseBlock[] =
    result.status === "error" ? [{ type: "paragraph", text: answer }] : result.finalResponseBlocks;

  await assistant.appendTurn({
    sessionId: req.params.sessionId,
    question: req.body.question,
    answer,
    answerBlocks,
    mechanism: result.mechanism,
    toolCalls,
    requestId,
    usage: result.usage,
  });

  res.json({ answer, blocks: answerBlocks, mechanism: result.mechanism, toolCalls, cached: result.cached, usage: result.usage });
});
