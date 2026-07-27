import { Router } from "express";
import { z }      from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody, validateQuery } from "../../middleware/validate";
import { centerFilter } from "../../lib/centerFilter";
import {
  createSlotSchema,
  updateSlotSchema,
  generateSessionsSchema,
  createAdHocSessionSchema,
  patchSessionSchema,
  sessionQuerySchema,
} from "@institute-os/shared";
import {
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  listSessions,
  createAdHocSession,
  patchSession,
  generateSessions,
  listFacultySessions,
  listTodaySessions,
} from "./schedule.service";

export const scheduleRouter = Router();

// ── Slots ─────────────────────────────────────────────────────────────────────

scheduleRouter.get(
  "/batches/:batchId/slots",
  requireAuth,
  async (req, res) => {
    const slots = await listSlots(prisma, req.params.batchId, req.auth!.tenantId);
    res.json(slots);
  },
);

scheduleRouter.post(
  "/batches/:batchId/slots",
  requireAuth,
  validateBody(createSlotSchema),
  async (req, res) => {
    const slot = await createSlot(prisma, req.params.batchId, req.auth!.tenantId, req.body);
    if (!slot) return res.status(404).json({ error: "Batch not found" });
    res.status(201).json(slot);
  },
);

scheduleRouter.patch(
  "/class-slots/:slotId",
  requireAuth,
  validateBody(updateSlotSchema),
  async (req, res) => {
    const slot = await updateSlot(prisma, req.params.slotId, req.auth!.tenantId, req.body);
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    res.json(slot);
  },
);

scheduleRouter.delete(
  "/class-slots/:slotId",
  requireAuth,
  async (req, res) => {
    const slot = await deleteSlot(prisma, req.params.slotId, req.auth!.tenantId);
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    res.json({ success: true });
  },
);

// ── Sessions ──────────────────────────────────────────────────────────────────

scheduleRouter.get(
  "/batches/:batchId/sessions",
  requireAuth,
  validateQuery(sessionQuerySchema),
  async (req, res) => {
    const sessions = await listSessions(prisma, req.params.batchId, req.auth!.tenantId, req.query as any);
    res.json(sessions);
  },
);

// Generate regular sessions from active slots for a date range
scheduleRouter.post(
  "/batches/:batchId/sessions/generate",
  requireAuth,
  validateBody(generateSessionsSchema),
  async (req, res) => {
    const result = await generateSessions(prisma, req.params.batchId, req.auth!.tenantId, req.body);
    if (!result) return res.status(404).json({ error: "Batch not found" });
    res.status(201).json(result);
  },
);

// Create an ad-hoc (extra / makeup) session
scheduleRouter.post(
  "/batches/:batchId/sessions",
  requireAuth,
  validateBody(createAdHocSessionSchema),
  async (req, res) => {
    const session = await createAdHocSession(prisma, req.params.batchId, req.auth!.tenantId, req.body);
    if (!session) return res.status(404).json({ error: "Batch not found" });
    res.status(201).json(session);
  },
);

scheduleRouter.patch(
  "/class-sessions/:sessionId",
  requireAuth,
  validateBody(patchSessionSchema),
  async (req, res) => {
    const session = await patchSession(prisma, req.params.sessionId, req.auth!.tenantId, req.body);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  },
);

// ── Cross-cutting views ───────────────────────────────────────────────────────

scheduleRouter.get(
  "/faculty/:facultyId/sessions",
  requireAuth,
  validateQuery(z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })),
  async (req, res) => {
    const sessions = await listFacultySessions(
      prisma,
      req.params.facultyId,
      req.auth!.tenantId,
      req.query as any,
    );
    res.json(sessions);
  },
);

scheduleRouter.get(
  "/sessions/today",
  requireAuth,
  async (req, res) => {
    const cFilter = centerFilter(req);
    const sessions = await listTodaySessions(prisma, cFilter.tenantId, cFilter.centerId);
    res.json(sessions);
  },
);
