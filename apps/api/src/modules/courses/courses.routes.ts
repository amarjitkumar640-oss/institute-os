import { Router } from "express";
import {
  createCourseSchema,
  updateCourseSchema,
  courseQuerySchema,
} from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateQuery, validateUuidParam } from "../../middleware/validate";
import type { Request } from "express";
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from "./courses.service";
import { z } from "zod";

export const coursesRouter = Router();

type ParsedQuery = z.infer<typeof courseQuerySchema>;
type ReqWithQuery = Request & { parsedQuery: ParsedQuery };

// ─── GET /api/courses ───────────────────────────────────────────────────────
// Any authenticated staff can list courses.
coursesRouter.get(
  "/",
  requireAuth,
  validateQuery(courseQuerySchema),
  async (req, res) => {
    const query = (req as ReqWithQuery).parsedQuery;
    const result = await listCourses(query, req.auth!.tenantId);
    res.json(result);
  }
);

// ─── GET /api/courses/:id ───────────────────────────────────────────────────
// Returns full course detail including per-status batch breakdown.
coursesRouter.get(
  "/:id",
  requireAuth,
  validateUuidParam("id"),
  async (req, res) => {
    const course = await getCourse(req.params.id, req.auth!.tenantId);
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.json(course);
  }
);

// ─── POST /api/courses ──────────────────────────────────────────────────────
// Admin only. Returns 409 if a course with the same name already exists.
coursesRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createCourseSchema),
  async (req, res) => {
    const result = await createCourse(req.body, req.auth!.tenantId);
    if (!result.ok) {
      return res.status(409).json({
        error: "A course with this name already exists",
      });
    }
    res.status(201).json(result.course);
  }
);

// ─── PATCH /api/courses/:id ─────────────────────────────────────────────────
// Admin only. Partial update — only supplied fields are changed.
coursesRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateUuidParam("id"),
  validateBody(updateCourseSchema),
  async (req, res) => {
    const result = await updateCourse(req.params.id, req.auth!.tenantId, req.body);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Course not found" });
      return res.status(409).json({
        error: "Another course with this name already exists",
      });
    }
    res.json(result.course);
  }
);

// ─── DELETE /api/courses/:id ─────────────────────────────────────────────────
// Admin only. Blocked if the course has any batches (data integrity guard).
coursesRouter.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateUuidParam("id"),
  async (req, res) => {
    const result = await deleteCourse(req.params.id, req.auth!.tenantId);
    if (!result.ok) {
      if ("notFound" in result) return res.status(404).json({ error: "Course not found" });
      if ("hasData" in result) {
        return res.status(409).json({
          error: `Cannot delete course — it has ${result.batchCount} associated batch(es). Archive batches first.`,
        });
      }
    }
    res.status(204).send();
  }
);
