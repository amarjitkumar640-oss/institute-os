import { Router } from "express";
import { createBatchSchema, updateBatchSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { centerFilter, centerIdForCreate, tenantIdForCreate } from "../../lib/centerFilter";

export const batchesRouter = Router();

function serialize(b: any) {
  const { _count, course, ...rest } = b;
  const { examCategories, ...courseRest } = course;
  return {
    ...rest,
    course: { ...courseRest, examCategories: examCategories.map((ec: any) => ec.examCategory) },
    enrolledCount: _count?.enrollments ?? 0,
  };
}

const INCLUDE = {
  course:  { include: { examCategories: { include: { examCategory: true } } } },
  center:  { select: { id: true, name: true } },
  _count:  { select: { enrollments: true } },
} as const;

batchesRouter.get("/", requireAuth, async (req, res) => {
  const batches = await prisma.batch.findMany({
    where:   centerFilter(req),
    include: INCLUDE,
    orderBy: { startDate: "asc" },
  });
  res.json(batches.map(serialize));
});

batchesRouter.get("/:id", requireAuth, async (req, res) => {
  const batch = await prisma.batch.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId },
    include: INCLUDE,
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  res.json(serialize(batch));
});

batchesRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createBatchSchema),
  async (req, res) => {
    const course = await prisma.course.findFirst({ where: { id: req.body.courseId, tenantId: req.auth!.tenantId } });
    if (!course) return res.status(404).json({ error: "Course not found" });

    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });

    const batch = await prisma.batch.create({
      data: { ...req.body, centerId, tenantId: tenantIdForCreate(req) },
      include: INCLUDE,
    });
    res.status(201).json(serialize(batch));
  }
);

batchesRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(updateBatchSchema),
  async (req, res) => {
    const batch = await prisma.batch.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const updated = await prisma.batch.update({
      where: { id: req.params.id },
      data: req.body,
      include: INCLUDE,
    });
    res.json(serialize(updated));
  }
);

batchesRouter.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const batch = await prisma.batch.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  if (batch._count.enrollments > 0) {
    return res.status(409).json({
      hasEnrollments: true,
      message: `This batch has ${batch._count.enrollments} enrolled student(s) and cannot be deleted.`,
    });
  }

  await prisma.batch.delete({ where: { id: req.params.id } });
  res.json({ deleted: true });
});
