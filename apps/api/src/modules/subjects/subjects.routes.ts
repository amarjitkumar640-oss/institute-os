import { Router } from "express";
import { createSubjectSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";

export const subjectsRouter = Router();

subjectsRouter.get("/", requireAuth, async (_req, res) => {
  const subjects = await prisma.subject.findMany();
  res.json(subjects);
});

subjectsRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createSubjectSchema),
  async (req, res) => {
    const subject = await prisma.subject.create({ data: req.body });
    res.status(201).json(subject);
  }
);
