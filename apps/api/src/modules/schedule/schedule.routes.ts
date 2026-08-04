import { Router } from "express";
import { z }      from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateQuery } from "../../middleware/validate";
import { assignedCenterIds } from "../../lib/centerFilter";
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
  autoGenerateSessions,
  listFacultySessions,
  listTodaySessions,
} from "./schedule.service";
import { notifySessionChange, notifyFacultyReassignment } from "../notifications/notification.service";

export const scheduleRouter = Router();

// ── Slots ─────────────────────────────────────────────────────────────────────

scheduleRouter.get(
  "/batches/:batchId/slots",
  requireAuth,
  async (req, res) => {
    const facultyId = req.auth!.role === "teacher" ? (req.auth!.facultyId ?? undefined) : undefined;
    const slots = await listSlots(prisma, req.params.batchId, req.auth!.tenantId, facultyId);
    res.json(slots);
  },
);

scheduleRouter.post(
  "/batches/:batchId/slots",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createSlotSchema),
  async (req, res) => {
    const slot = await createSlot(prisma, req.params.batchId, req.auth!.tenantId, req.body);
    if (!slot) return res.status(404).json({ error: "Batch not found" });

    // Auto-generate sessions so the teacher sees their classes immediately
    autoGenerateSessions(prisma, req.params.batchId, req.auth!.tenantId, req.body.validFrom).catch(console.error);

    res.status(201).json(slot);
  },
);

scheduleRouter.patch(
  "/class-slots/:slotId",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(updateSlotSchema),
  async (req, res) => {
    // Captured before the update so we can tell the outgoing teacher apart
    // from the incoming one once the slot's facultyId has changed.
    const previousFacultyId = req.body.facultyId !== undefined
      ? (await prisma.classSlot.findUnique({ where: { id: req.params.slotId }, select: { facultyId: true } }))?.facultyId ?? null
      : undefined;

    const slot = await updateSlot(prisma, req.params.slotId, req.auth!.tenantId, req.body);
    if (!slot) return res.status(404).json({ error: "Slot not found" });

    // If the faculty/subject assignment changed, ensure sessions exist for future dates
    if (req.body.facultyId !== undefined || req.body.subjectId !== undefined) {
      autoGenerateSessions(prisma, slot.batch.id, req.auth!.tenantId, null).catch(console.error);
    }

    if (previousFacultyId !== undefined) {
      notifyFacultyReassignment(
        prisma, req.auth!.tenantId,
        { batchId: slot.batch.id, batchName: slot.batch.name, subjectName: slot.subject?.name ?? null },
        previousFacultyId, slot.facultyId,
      ).catch(console.error);
    }

    res.json(slot);
  },
);

scheduleRouter.delete(
  "/class-slots/:slotId",
  requireAuth,
  requireRole("admin", "frontdesk"),
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
    const facultyId = req.auth!.role === "teacher" ? (req.auth!.facultyId ?? undefined) : undefined;
    const sessions = await listSessions(prisma, req.params.batchId, req.auth!.tenantId, { ...req.query as any, facultyId });
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
    // Captured before the update — same reasoning as the slot PATCH above.
    const previousFacultyId = req.body.facultyId !== undefined
      ? (await prisma.classSession.findUnique({ where: { id: req.params.sessionId }, select: { facultyId: true } }))?.facultyId ?? null
      : undefined;

    const session = await patchSession(prisma, req.params.sessionId, req.auth!.tenantId, req.body);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Teachers may only update sessions assigned to them.
    if (req.auth!.role === "teacher" && session.facultyId !== req.auth!.facultyId) {
      return res.status(403).json({ error: "Not your session" });
    }

    await notifySessionChange(prisma, req.auth!.tenantId, session, req.body).catch(console.error);
    if (previousFacultyId !== undefined && previousFacultyId !== session.facultyId) {
      notifyFacultyReassignment(
        prisma, req.auth!.tenantId,
        { batchId: session.batchId, batchName: session.batch.name, subjectName: session.subject?.name ?? null },
        previousFacultyId, session.facultyId,
      ).catch(console.error);
    }
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
    // Teachers may only ever read their own linked faculty's sessions.
    // Admin/frontdesk are unrestricted, same as before.
    if (req.auth!.role === "teacher" && req.auth!.facultyId !== req.params.facultyId) {
      return res.status(403).json({ error: "Not your schedule" });
    }
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
    const sessions = await listTodaySessions(prisma, req.auth!.tenantId, await assignedCenterIds(req));
    res.json(sessions);
  },
);
