import { Router } from "express";
import {
  createFacultySchema,
  updateFacultySchema,
  facultyQuerySchema,
} from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateQuery, validateUuidParam } from "../../middleware/validate";
import type { Request } from "express";
import { z } from "zod";
import {
  listFaculty,
  getFaculty,
  createFaculty,
  updateFaculty,
  deleteFaculty,
} from "./faculty.service";
import { centerFilter, centerIdForCreate } from "../../lib/centerFilter";

export const facultyRouter = Router();

type ParsedQuery = z.infer<typeof facultyQuerySchema>;
type ReqWithQuery = Request & { parsedQuery: ParsedQuery };

// ─── GET /api/faculty ─────────────────────────────────────────────────────────
facultyRouter.get(
  "/",
  requireAuth,
  validateQuery(facultyQuerySchema),
  async (req, res) => {
    const query = (req as ReqWithQuery).parsedQuery;
    const result = await listFaculty(query, req.auth?.centerId);
    res.json(result);
  }
);

// ─── GET /api/faculty/:id ─────────────────────────────────────────────────────
facultyRouter.get(
  "/:id",
  requireAuth,
  validateUuidParam("id"),
  async (req, res) => {
    const faculty = await getFaculty(req.params.id);
    if (!faculty) return res.status(404).json({ error: "Faculty not found" });
    res.json(faculty);
  }
);

// ─── POST /api/faculty ────────────────────────────────────────────────────────
facultyRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createFacultySchema),
  async (req, res) => {
    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
    const result = await createFaculty(req.body, centerId);
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
  requireRole("admin"),
  validateUuidParam("id"),
  validateBody(updateFacultySchema),
  async (req, res) => {
    const result = await updateFaculty(req.params.id, req.body);
    if (!result.ok) {
      if ("notFound" in result)      return res.status(404).json({ error: "Faculty not found" });
      if ("emailConflict" in result) return res.status(409).json({ error: "Another faculty member with this email already exists.", field: "email" });
      if ("phoneConflict" in result) return res.status(409).json({ error: "Another faculty member with this phone number already exists.", field: "phone" });
    } else {
      res.json(result.faculty);
    }
  }
);

// ─── DELETE /api/faculty/:id ──────────────────────────────────────────────────
facultyRouter.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateUuidParam("id"),
  async (req, res) => {
    const result = await deleteFaculty(req.params.id);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Faculty not found" });
    }
    res.status(204).send();
  }
);
