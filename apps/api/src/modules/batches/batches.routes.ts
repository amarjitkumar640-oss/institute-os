import { Router } from "express";
import { z } from "zod";
import { createBatchSchema, updateBatchSchema, mergeBatchSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { centerFilter, centerIdForCreate, tenantIdForCreate } from "../../lib/centerFilter";
import { mergeBatch, BatchNotFoundError, SameBatchError, EmptySourceBatchError } from "./batch-merge.service";
import { computeInitialBatchStatus } from "./batchStatus.sweep";
import { listOffersForBatch, createOffer, updateOffer, deleteOffer } from "./offers.service";

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

// When a teacher calls this route, only return batches they have a slot in.
function teacherBatchFilter(req: any) {
  if (req.auth!.activeRole === "teacher" && req.auth!.facultyId) {
    return { classSlots: { some: { facultyId: req.auth!.facultyId } } };
  }
  return {};
}

batchesRouter.get("/", requireAuth, requirePermission("batches", "read"), async (req, res) => {
  const batches = await prisma.batch.findMany({
    where:   { ...(await centerFilter(req)), ...teacherBatchFilter(req) },
    include: INCLUDE,
    orderBy: { startDate: "asc" },
  });
  res.json(batches.map(serialize));
});

batchesRouter.get("/:id", requireAuth, requirePermission("batches", "read"), async (req, res) => {
  const batch = await prisma.batch.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId, ...teacherBatchFilter(req) },
    include: INCLUDE,
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  res.json(serialize(batch));
});

batchesRouter.post(
  "/",
  requireAuth,
  requirePermission("batches", "write"),
  validateBody(createBatchSchema),
  async (req, res) => {
    const course = await prisma.course.findFirst({ where: { id: req.body.courseId, tenantId: req.auth!.tenantId } });
    if (!course) return res.status(404).json({ error: "Course not found" });

    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });

    const batch = await prisma.batch.create({
      data: {
        ...req.body,
        centerId,
        tenantId: tenantIdForCreate(req),
        // Otherwise every new batch silently gets the schema's "upcoming"
        // default even when startDate (or endDate) is already in the past —
        // e.g. backfilling a batch that's already running or finished — and
        // sits wrong until the next batch-status-sweep tick happens to catch it.
        status: computeInitialBatchStatus(req.body.startDate, req.body.endDate),
      },
      include: INCLUDE,
    });
    res.status(201).json(serialize(batch));
  }
);

batchesRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("batches", "edit"),
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

batchesRouter.delete("/:id", requireAuth, requirePermission("batches", "delete"), async (req, res) => {
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

// POST /batches/:id/merge — moves every active student out of :id and into
// body.toBatchId. See batch-merge.service.ts for exactly what does and
// doesn't change (no course-match requirement, fee/courseId untouched).
batchesRouter.post(
  "/:id/merge",
  requireAuth,
  requirePermission("batches", "edit"),
  validateBody(mergeBatchSchema),
  async (req, res) => {
    try {
      const result = await mergeBatch(prisma, req.auth!.tenantId, req.params.id, req.body.toBatchId);
      res.json(result);
    } catch (err) {
      if (err instanceof BatchNotFoundError) return res.status(404).json({ error: err.message });
      if (err instanceof SameBatchError || err instanceof EmptySourceBatchError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  }
);

// ── Discount offers ("first N students in this batch get ₹X off") ────────────

const offerSchema = z.object({
  discountAmount: z.number().nonnegative().max(10_000_000),
  maxRedemptions: z.number().int().positive().max(10_000),
});
const updateOfferSchema = offerSchema.partial().extend({ isActive: z.boolean().optional() });

batchesRouter.get(
  "/:id/offers",
  requireAuth,
  requirePermission("batches", "read"),
  validateUuidParam("id"),
  async (req, res) => {
    const offers = await listOffersForBatch(prisma, req.params.id, req.auth!.tenantId);
    res.json(offers);
  },
);

batchesRouter.post(
  "/:id/offers",
  requireAuth,
  requirePermission("batches", "edit"),
  validateUuidParam("id"),
  validateBody(offerSchema),
  async (req, res) => {
    try {
      const offer = await createOffer(prisma, req.params.id, req.auth!.tenantId, req.body);
      res.status(201).json(offer);
    } catch (err: any) {
      if (err.message === "BATCH_NOT_FOUND") return res.status(404).json({ error: "Batch not found" });
      throw err;
    }
  },
);

batchesRouter.patch(
  "/offers/:offerId",
  requireAuth,
  requirePermission("batches", "edit"),
  validateUuidParam("offerId"),
  validateBody(updateOfferSchema),
  async (req, res) => {
    try {
      const offer = await updateOffer(prisma, req.params.offerId, req.auth!.tenantId, req.body);
      res.json(offer);
    } catch (err: any) {
      if (err.message === "OFFER_NOT_FOUND") return res.status(404).json({ error: "Offer not found" });
      if (err.message === "MAX_REDEMPTIONS_BELOW_REDEEMED_COUNT") {
        return res.status(422).json({ error: "Max redemptions cannot be set below the number already redeemed" });
      }
      throw err;
    }
  },
);

batchesRouter.delete(
  "/offers/:offerId",
  requireAuth,
  requirePermission("batches", "delete"),
  validateUuidParam("offerId"),
  async (req, res) => {
    try {
      const result = await deleteOffer(prisma, req.params.offerId, req.auth!.tenantId);
      if (!result.ok) {
        return res.status(409).json({
          error: `Cannot delete this offer — it has already been redeemed by ${result.redeemedCount} student(s).`,
        });
      }
      res.status(204).send();
    } catch (err: any) {
      if (err.message === "OFFER_NOT_FOUND") return res.status(404).json({ error: "Offer not found" });
      throw err;
    }
  },
);
