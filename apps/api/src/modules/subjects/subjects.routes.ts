import { Router } from "express";
import {
  createSubjectSchema,
  updateSubjectSchema,
  subjectQuerySchema,
} from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";

export const subjectsRouter = Router();

// ── Serialize ──────────────────────────────────────────────────────────────────

function serialize(s: {
  id: string;
  name: string;
  examCategory: string | null;
  _count?: { facultySubjects: number };
}) {
  return {
    id:           s.id,
    name:         s.name,
    examCategory: s.examCategory,
    facultyCount: s._count?.facultySubjects ?? 0,
  };
}

// ── GET / ──────────────────────────────────────────────────────────────────────

subjectsRouter.get("/", requireAuth, async (req, res) => {
  const query = subjectQuerySchema.safeParse(req.query);
  const { examCategory, search } = query.success
    ? query.data
    : { examCategory: undefined, search: undefined };

  const where: Record<string, unknown> = {};
  if (examCategory) where.examCategory = examCategory;
  if (search?.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  const subjects = await prisma.subject.findMany({
    where,
    orderBy: [{ examCategory: "asc" }, { name: "asc" }],
    include: { _count: { select: { facultySubjects: true } } },
  });

  res.json(subjects.map(serialize));
});

// ── GET /:id ───────────────────────────────────────────────────────────────────

subjectsRouter.get("/:id", requireAuth, async (req, res) => {
  const subject = await prisma.subject.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { facultySubjects: true } } },
  });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  res.json(serialize(subject));
});

// ── POST / ────────────────────────────────────────────────────────────────────

subjectsRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createSubjectSchema),
  async (req, res) => {
    const { name, examCategory } = req.body as { name: string; examCategory?: string | null };

    const existing = await prisma.subject.findUnique({ where: { name } });
    if (existing) {
      return res
        .status(409)
        .json({ conflict: true, field: "name", message: `A subject named "${name}" already exists.` });
    }

    const subject = await prisma.subject.create({
      data: { name, examCategory: examCategory ?? null },
      include: { _count: { select: { facultySubjects: true } } },
    });

    res.status(201).json(serialize(subject));
  }
);

// ── PATCH /:id ────────────────────────────────────────────────────────────────

subjectsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateBody(updateSubjectSchema),
  async (req, res) => {
    const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
    if (!subject) return res.status(404).json({ notFound: true });

    const { name, examCategory } = req.body as { name?: string; examCategory?: string | null };

    if (name && name !== subject.name) {
      const conflict = await prisma.subject.findUnique({ where: { name } });
      if (conflict) {
        return res
          .status(409)
          .json({ conflict: true, field: "name", message: `A subject named "${name}" already exists.` });
      }
    }

    const updated = await prisma.subject.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(examCategory !== undefined ? { examCategory: examCategory ?? null } : {}),
      },
      include: { _count: { select: { facultySubjects: true } } },
    });

    res.json(serialize(updated));
  }
);

// ── DELETE /:id ───────────────────────────────────────────────────────────────

subjectsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const subject = await prisma.subject.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { facultySubjects: true } } },
    });
    if (!subject) return res.status(404).json({ notFound: true });

    if (subject._count.facultySubjects > 0) {
      return res.status(409).json({
        hasData: true,
        message: `${subject._count.facultySubjects} faculty member${
          subject._count.facultySubjects > 1 ? "s are" : " is"
        } currently teaching this subject. Remove the assignment first.`,
      });
    }

    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }
);
