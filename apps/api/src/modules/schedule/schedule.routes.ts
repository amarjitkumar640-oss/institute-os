import { Router } from "express";
import { z }      from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateQuery } from "../../middleware/validate";
import { assignedCenterIds } from "../../lib/centerFilter";
import {
  createSlotSchema,
  updateSlotSchema,
  generateSessionsSchema,
  createAdHocSessionSchema,
  patchSessionSchema,
  sessionQuerySchema,
  setAttendanceSchema,
} from "@institute-os/shared";
import {
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  listSessions,
  createAdHocSession,
  patchSession,
  SessionNotYetEndedError,
  generateSessions,
  autoGenerateSessions,
  listFacultySessions,
  listTodaySessions,
  getSessionRoster,
  setSessionAttendance,
} from "./schedule.service";
import { notifySessionChange, notifyFacultyReassignment, notifySubjectChange } from "../notifications/notification.service";

export const scheduleRouter = Router();

// ── Slots ─────────────────────────────────────────────────────────────────────

scheduleRouter.get(
  "/batches/:batchId/slots",
  requireAuth,
  requirePermission("schedule", "read"),
  async (req, res) => {
    const facultyId = req.auth!.activeRole === "teacher" ? (req.auth!.facultyId ?? undefined) : undefined;
    const slots = await listSlots(prisma, req.params.batchId, req.auth!.tenantId, facultyId);
    res.json(slots);
  },
);

scheduleRouter.post(
  "/batches/:batchId/slots",
  requireAuth,
  requirePermission("schedule", "write"),
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
  requirePermission("schedule", "edit"),
  validateBody(updateSlotSchema),
  async (req, res) => {
    // Editing the recurring weekly template is admin/frontdesk-only — more
    // consequential than the per-occurrence edits a teacher can make on a
    // single session (marking it complete), since a slot change affects
    // every future session generated from it, not just one class.
    if (req.auth!.activeRole === "teacher") {
      return res.status(403).json({ error: "Teachers cannot edit the weekly template" });
    }

    // Captured before the update so we can tell the outgoing teacher apart
    // from the incoming one once the slot's facultyId has changed — subject
    // name is captured too since a slot edit can change both fields at
    // once, and the outgoing teacher's notification must show what they
    // actually lost, not whatever the subject was changed to.
    const previous = req.body.facultyId !== undefined
      ? await prisma.classSlot.findUnique({
          where: { id: req.params.slotId },
          select: { facultyId: true, subject: { select: { name: true } } },
        })
      : undefined;

    const slot = await updateSlot(prisma, req.params.slotId, req.auth!.tenantId, req.body);
    if (!slot) return res.status(404).json({ error: "Slot not found" });

    // If the faculty/subject assignment changed, ensure sessions exist for future dates
    if (req.body.facultyId !== undefined || req.body.subjectId !== undefined) {
      autoGenerateSessions(prisma, slot.batch.id, req.auth!.tenantId, null).catch(console.error);
    }

    if (previous !== undefined) {
      await notifyFacultyReassignment(
        prisma, req.auth!.tenantId,
        {
          batchId: slot.batch.id, batchName: slot.batch.name,
          oldSubjectName: previous?.subject?.name ?? null,
          newSubjectName: slot.subject?.name ?? null,
        },
        previous?.facultyId ?? null, slot.facultyId,
      ).catch(console.error);
    }

    res.json(slot);
  },
);

scheduleRouter.delete(
  "/class-slots/:slotId",
  requireAuth,
  requirePermission("schedule", "delete"),
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
  requirePermission("schedule", "read"),
  validateQuery(sessionQuerySchema),
  async (req, res) => {
    const facultyId = req.auth!.activeRole === "teacher" ? (req.auth!.facultyId ?? undefined) : undefined;
    const sessions = await listSessions(prisma, req.params.batchId, req.auth!.tenantId, { ...req.query as any, facultyId });
    res.json(sessions);
  },
);

// Generate regular sessions from active slots for a date range
// Previously had NO requireRole at all (an apparent oversight — its sibling
// slot-write route has always been admin/frontdesk-only); closed to match
// that sibling rather than preserving the gap.
scheduleRouter.post(
  "/batches/:batchId/sessions/generate",
  requireAuth,
  requirePermission("schedule", "write"),
  validateBody(generateSessionsSchema),
  async (req, res) => {
    const result = await generateSessions(prisma, req.params.batchId, req.auth!.tenantId, req.body);
    if (!result) return res.status(404).json({ error: "Batch not found" });
    res.status(201).json(result);
  },
);

// Create an ad-hoc (extra / makeup) session — same gap-closing reasoning as
// the sibling /generate route above.
scheduleRouter.post(
  "/batches/:batchId/sessions",
  requireAuth,
  requirePermission("schedule", "write"),
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
  requirePermission("schedule", "edit"),
  validateBody(patchSessionSchema),
  async (req, res) => {
    // Cancelling and reassigning are a step above the ordinary edit a teacher
    // can otherwise make here (marking their own ended session complete) —
    // only admin/frontdesk may cancel a class or reassign its subject/faculty.
    // Checked before any mutation happens, unlike the ownership check below
    // which necessarily runs after (it needs the post-update session to
    // compare facultyId).
    if (req.auth!.activeRole === "teacher") {
      if (req.body.status === "cancelled") {
        return res.status(403).json({ error: "Teachers cannot cancel a class" });
      }
      if (req.body.subjectId !== undefined || req.body.facultyId !== undefined) {
        return res.status(403).json({ error: "Teachers cannot reassign subject or faculty" });
      }
    }

    // Captured before the update — same reasoning as the slot PATCH above,
    // plus the previous subject so a combined subject+faculty change can
    // tell the outgoing teacher what they actually lost, and a subject-only
    // change (same teacher) can be detected and reported correctly.
    const previous = (req.body.facultyId !== undefined || req.body.subjectId !== undefined)
      ? await prisma.classSession.findUnique({
          where: { id: req.params.sessionId },
          select: { facultyId: true, subjectId: true, subject: { select: { name: true } } },
        })
      : undefined;

    let session;
    try {
      session = await patchSession(prisma, req.params.sessionId, req.auth!.tenantId, req.body);
    } catch (err) {
      if (err instanceof SessionNotYetEndedError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Teachers may only update sessions assigned to them.
    if (req.auth!.activeRole === "teacher" && session.facultyId !== req.auth!.facultyId) {
      return res.status(403).json({ error: "Not your session" });
    }

    await notifySessionChange(prisma, req.auth!.tenantId, session, req.body).catch(console.error);

    const facultyChanged = previous != null
      && req.body.facultyId !== undefined && previous.facultyId !== session.facultyId;
    const subjectChangedOnly = !facultyChanged && previous != null
      && req.body.subjectId !== undefined && previous.subjectId !== session.subjectId;

    if (facultyChanged) {
      await notifyFacultyReassignment(
        prisma, req.auth!.tenantId,
        {
          batchId: session.batchId, batchName: session.batch.name,
          oldSubjectName: previous!.subject?.name ?? null,
          newSubjectName: session.subject?.name ?? null,
        },
        previous!.facultyId, session.facultyId,
      ).catch(console.error);
    } else if (subjectChangedOnly) {
      await notifySubjectChange(
        prisma, req.auth!.tenantId,
        { batchId: session.batchId, batchName: session.batch.name },
        session.facultyId, previous!.subject?.name ?? null, session.subject?.name ?? null,
      ).catch(console.error);
    }
    res.json(session);
  },
);

// ── Session attendance ──────────────────────────────────────────────────────
// Auth is checked here, before any read/write in the service layer — unlike the
// PATCH above (which updates first, then 403s after the fact for teachers on a
// mismatch), this checks facultyId ownership up front.

async function loadSessionForAttendance(sessionId: string, tenantId: string) {
  return prisma.classSession.findFirst({
    where:  { id: sessionId, batch: { tenantId } },
    select: { batchId: true, facultyId: true },
  });
}

function canTouchSession(req: import("express").Request, session: { facultyId: string | null }) {
  return !(req.auth!.activeRole === "teacher" && session.facultyId !== req.auth!.facultyId);
}

scheduleRouter.get(
  "/class-sessions/:sessionId/attendance",
  requireAuth,
  requirePermission("schedule", "read"),
  async (req, res) => {
    const session = await loadSessionForAttendance(req.params.sessionId, req.auth!.tenantId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!canTouchSession(req, session)) return res.status(403).json({ error: "Not your session" });

    const roster = await getSessionRoster(prisma, req.params.sessionId, req.auth!.tenantId);
    res.json(roster);
  },
);

scheduleRouter.put(
  "/class-sessions/:sessionId/attendance",
  requireAuth,
  requirePermission("schedule", "edit"),
  validateBody(setAttendanceSchema),
  async (req, res) => {
    // Marking attendance is admin/frontdesk-only — a step above the ordinary
    // edit a teacher can otherwise make here (marking their own ended
    // session complete). Viewing the roster (GET above) stays available to
    // a teacher for their own session; only recording marks is restricted.
    if (req.auth!.activeRole === "teacher") {
      return res.status(403).json({ error: "Teachers cannot mark attendance" });
    }

    const session = await loadSessionForAttendance(req.params.sessionId, req.auth!.tenantId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!canTouchSession(req, session)) return res.status(403).json({ error: "Not your session" });

    const roster = await setSessionAttendance(
      prisma, req.params.sessionId, session.batchId, req.body.marks, req.auth!.staffId ?? null,
    );
    res.json(roster);
  },
);

// ── Cross-cutting views ───────────────────────────────────────────────────────

scheduleRouter.get(
  "/faculty/:facultyId/sessions",
  requireAuth,
  requirePermission("schedule", "read"),
  validateQuery(z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })),
  async (req, res) => {
    // Teachers may only ever read their own linked faculty's sessions.
    // Admin/frontdesk are unrestricted, same as before.
    if (req.auth!.activeRole === "teacher" && req.auth!.facultyId !== req.params.facultyId) {
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
  requirePermission("schedule", "read"),
  async (req, res) => {
    const sessions = await listTodaySessions(prisma, req.auth!.tenantId, await assignedCenterIds(req));
    res.json(sessions);
  },
);
