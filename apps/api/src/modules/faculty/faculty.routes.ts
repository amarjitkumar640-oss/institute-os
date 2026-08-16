import { Router } from "express";
import {
  createFacultySchema,
  updateFacultySchema,
  facultyQuerySchema,
  setFacultyAttendanceSchema,
} from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateQuery, validateUuidParam } from "../../middleware/validate";
import type { Request } from "express";
import { z } from "zod";
import {
  listFaculty,
  getFaculty,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  getFacultyAttendanceRoster,
  setFacultyAttendance,
} from "./faculty.service";
import { assignedCenterIds, centerIdForCreate, tenantIdForCreate } from "../../lib/centerFilter";

export const facultyRouter = Router();

type ParsedQuery = z.infer<typeof facultyQuerySchema>;
type ReqWithQuery = Request & { parsedQuery: ParsedQuery };

// ─── GET /api/faculty ─────────────────────────────────────────────────────────
facultyRouter.get(
  "/",
  requireAuth,
  requirePermission("faculty", "read"),
  validateQuery(facultyQuerySchema),
  async (req, res) => {
    const query = (req as ReqWithQuery).parsedQuery;
    const result = await listFaculty(query, req.auth!.tenantId, await assignedCenterIds(req));
    res.json(result);
  }
);

// ─── Attendance (daily register) ───────────────────────────────────────────────
// Registered before GET/PATCH/DELETE "/:id" below — "attendance" would otherwise
// match the ":id" wildcard first and 400 on validateUuidParam. Day-to-day
// operational write, same role gate as fee collection — not admin-only like the
// faculty CRUD routes.

function resolveDate(raw: unknown): string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Date().toISOString().slice(0, 10);
}

facultyRouter.get(
  "/attendance",
  requireAuth,
  requirePermission("faculty-attendance", "read"),
  async (req, res) => {
    const date = resolveDate(req.query.date);
    const roster = await getFacultyAttendanceRoster(req.auth!.tenantId, await assignedCenterIds(req), date);
    res.json({ date, roster });
  }
);

facultyRouter.put(
  "/attendance",
  requireAuth,
  requirePermission("faculty-attendance", "edit"),
  validateBody(setFacultyAttendanceSchema),
  async (req, res) => {
    const roster = await setFacultyAttendance(
      req.auth!.tenantId, await assignedCenterIds(req),
      req.body.date, req.body.marks, req.auth!.staffId ?? null,
    );
    res.json({ date: req.body.date, roster });
  }
);

// ─── GET /api/faculty/:id ─────────────────────────────────────────────────────
facultyRouter.get(
  "/:id",
  requireAuth,
  requirePermission("faculty", "read"),
  validateUuidParam("id"),
  async (req, res) => {
    const faculty = await getFaculty(req.params.id, req.auth!.tenantId);
    if (!faculty) return res.status(404).json({ error: "Faculty not found" });
    res.json(faculty);
  }
);

// ─── POST /api/faculty ────────────────────────────────────────────────────────
facultyRouter.post(
  "/",
  requireAuth,
  requirePermission("faculty", "write"),
  validateBody(createFacultySchema),
  async (req, res) => {
    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
    const result = await createFaculty(req.body, tenantIdForCreate(req), centerId);
    if (!result.ok) {
      if ("emailConflict" in result)
        return res.status(409).json({ error: "A faculty member with this email already exists.", field: "email" });
      if ("phoneConflict" in result)
        return res.status(409).json({ error: "A faculty member with this phone number already exists.", field: "phone" });
    } else {
      res.status(201).json(result.faculty);
    }
  }
);

// ─── PATCH /api/faculty/:id ───────────────────────────────────────────────────
facultyRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("faculty", "edit"),
  validateUuidParam("id"),
  validateBody(updateFacultySchema),
  async (req, res) => {
    const result = await updateFaculty(req.params.id, req.auth!.tenantId, req.body);
    if (!result.ok) {
      if ("notFound" in result)      return res.status(404).json({ error: "Faculty not found" });
      if ("emailConflict" in result) return res.status(409).json({ error: "Another faculty member with this email already exists.", field: "email" });
      if ("phoneConflict" in result) return res.status(409).json({ error: "Another faculty member with this phone number already exists.", field: "phone" });
      if ("staffNotFound" in result) return res.status(404).json({ error: "No teacher account found with that ID.", field: "staffId" });
      if ("staffConflict" in result) return res.status(409).json({ error: "That teacher account is already linked to another faculty profile.", field: "staffId" });
    } else {
      res.json(result.faculty);
    }
  }
);

// ─── DELETE /api/faculty/:id ──────────────────────────────────────────────────
facultyRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("faculty", "delete"),
  validateUuidParam("id"),
  async (req, res) => {
    const result = await deleteFaculty(req.params.id, req.auth!.tenantId);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Faculty not found" });
    }
    res.status(204).send();
  }
);
