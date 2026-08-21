import { Router } from "express";
import {
  createCourseSchema,
  updateCourseSchema,
  courseQuerySchema,
} from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateQuery, validateUuidParam } from "../../middleware/validate";
import type { Request } from "express";
import {
  listCourses,
  listCourseNames,
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
coursesRouter.get(
  "/",
  requireAuth,
  requirePermission("courses", "read"),
  validateQuery(courseQuerySchema),
  async (req, res) => {
    const query = (req as ReqWithQuery).parsedQuery;
    const result = await listCourses(query, req.auth!.tenantId);
    res.json(result);
  }
);

// ─── GET /api/courses/names ─────────────────────────────────────────────────
// Deliberately ahead of GET /:id and requireAuth-only (no requirePermission)
// — id+name only, for populating course-filter chips on screens like the
// student list, so a role without courses.read (e.g. teacher) can still
// filter by course without gaining access to full course management.
coursesRouter.get("/names", requireAuth, async (req, res) => {
  const courses = await listCourseNames(req.auth!.tenantId);
  res.json(courses);
});

// ─── GET /api/courses/:id ───────────────────────────────────────────────────
// Returns full course detail including per-status batch breakdown.
coursesRouter.get(
  "/:id",
  requireAuth,
  requirePermission("courses", "read"),
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
  requirePermission("courses", "write"),
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
  requirePermission("courses", "edit"),
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
  requirePermission("courses", "delete"),
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
