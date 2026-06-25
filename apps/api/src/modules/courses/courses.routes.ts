import { Router } from "express";
import { createCourseSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";

export const coursesRouter = Router();

coursesRouter.get("/", requireAuth, async (_req, res) => {
  const courses = await prisma.course.findMany();
  res.json(courses);
});

coursesRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createCourseSchema),
  async (req, res) => {
    const course = await prisma.course.create({ data: req.body });
    res.status(201).json(course);
  }
);
