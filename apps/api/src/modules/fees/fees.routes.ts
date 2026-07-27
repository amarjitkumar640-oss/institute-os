import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  upsertFeeTemplate,
  getFeeTemplate,
  generateSchedule,
  applyDiscount,
  editInstallment,
  recordPayment,
  getScheduleDetail,
  listSchedules,
  getFeeSummary,
} from "./fees.service";
import {
  upsertFeeTemplateSchema,
  generateScheduleSchema,
  applyDiscountSchema,
  editInstallmentSchema,
  recordPaymentSchema,
} from "@institute-os/shared";

export const feesRouter = Router();

// ── Fee templates ─────────────────────────────────────────────────────────────

feesRouter.get(
  "/templates/:courseId",
  requireAuth,
  async (req, res) => {
    const template = await getFeeTemplate(prisma, req.params.courseId, req.auth!.tenantId);
    if (!template) return res.status(404).json({ error: "No template for this course" });
    res.json(template);
  },
);

feesRouter.post(
  "/templates/:courseId",
  requireAuth,
  requireRole("admin"),
  validateBody(upsertFeeTemplateSchema),
  async (req, res) => {
    try {
      const template = await upsertFeeTemplate(prisma, req.params.courseId, req.auth!.tenantId, req.body);
      res.json(template);
    } catch (err: any) {
      if (err.message === "COURSE_NOT_FOUND") {
        return res.status(404).json({ error: "Course not found" });
      }
      throw err;
    }
  },
);

// ── Student schedules ─────────────────────────────────────────────────────────

feesRouter.get(
  "/schedules",
  requireAuth,
  validateQuery(
    z.object({
      search:  z.string().optional(),
      status:  z.enum(["active", "overdue", "partial", "completed"]).optional(),
      batchId: z.string().uuid().optional(),
    }),
  ),
  async (req, res) => {
    const { search, status, batchId } = req.query as {
      search?: string; status?: string; batchId?: string;
    };
    const data = await listSchedules(prisma, req.auth!.tenantId, req.auth?.centerId, { search, status, batchId });
    res.json(data);
  },
);

feesRouter.get(
  "/schedules/:enrollmentId",
  requireAuth,
  async (req, res) => {
    const schedule = await getScheduleDetail(prisma, req.params.enrollmentId, req.auth!.tenantId);
    if (!schedule) return res.status(404).json({ error: "No fee schedule for this enrollment" });
    res.json(schedule);
  },
);

feesRouter.post(
  "/schedules/:enrollmentId/generate",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(generateScheduleSchema),
  async (req, res) => {
    try {
      const schedule = await generateSchedule(prisma, req.params.enrollmentId, req.body, req.auth!.tenantId);
      res.status(201).json(schedule);
    } catch (err: any) {
      if (err.message === "SCHEDULE_ALREADY_EXISTS") {
        return res.status(409).json({ error: "A fee schedule already exists for this enrollment" });
      }
      if (err.message === "ENROLLMENT_NOT_FOUND") {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      if (err.message === "DISCOUNT_EXCEEDS_FEE") {
        return res.status(422).json({ error: "Discount cannot exceed total fee" });
      }
      throw err;
    }
  },
);

feesRouter.patch(
  "/schedules/:scheduleId/discount",
  requireAuth,
  requireRole("admin"),
  validateBody(applyDiscountSchema),
  async (req, res) => {
    try {
      const schedule = await applyDiscount(prisma, req.params.scheduleId, req.auth!.tenantId, req.body);
      res.json(schedule);
    } catch (err: any) {
      if (err.message === "SCHEDULE_NOT_FOUND") {
        return res.status(404).json({ error: "Fee schedule not found" });
      }
      if (err.message === "DISCOUNT_EXCEEDS_FEE") {
        return res.status(422).json({ error: "Discount cannot exceed total fee" });
      }
      throw err;
    }
  },
);

// ── Installments ──────────────────────────────────────────────────────────────

feesRouter.patch(
  "/installments/:id",
  requireAuth,
  requireRole("admin"),
  validateBody(editInstallmentSchema),
  async (req, res) => {
    try {
      const inst = await editInstallment(prisma, req.params.id, req.auth!.tenantId, req.body);
      res.json(inst);
    } catch (err: any) {
      if (err.message === "INSTALLMENT_NOT_FOUND") {
        return res.status(404).json({ error: "Installment not found" });
      }
      throw err;
    }
  },
);

// ── Payments ──────────────────────────────────────────────────────────────────

feesRouter.post(
  "/payments",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(recordPaymentSchema),
  async (req, res) => {
    try {
      const staffId = req.auth?.staffId ?? null;
      const txn = await recordPayment(prisma, staffId, req.auth!.tenantId, req.body);
      res.status(201).json(txn);
    } catch (err: any) {
      if (err.message === "SCHEDULE_NOT_FOUND") {
        return res.status(404).json({ error: "Fee schedule not found" });
      }
      if (err.message === "INSTALLMENT_NOT_FOUND") {
        return res.status(404).json({ error: "Installment not found" });
      }
      throw err;
    }
  },
);

feesRouter.get(
  "/payments",
  requireAuth,
  validateQuery(
    z.object({
      scheduleId: z.string().uuid().optional(),
    }),
  ),
  async (req, res) => {
    const { scheduleId } = req.query as { scheduleId?: string };
    const where = scheduleId
      ? { scheduleId, tenantId: req.auth!.tenantId }
      : {
          tenantId: req.auth!.tenantId,
          ...(req.auth?.centerId
            ? { schedule: { enrollment: { batch: { centerId: req.auth.centerId } } } }
            : {}),
        };

    const payments = await prisma.paymentTransaction.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take:    200,
      include: {
        collectedBy:  { select: { id: true, fullName: true } },
        installment:  { select: { id: true, label: true } },
      },
    });
    res.json(payments);
  },
);

// ── Dashboard summary ─────────────────────────────────────────────────────────

feesRouter.get(
  "/summary",
  requireAuth,
  async (req, res) => {
    const summary = await getFeeSummary(prisma, req.auth!.tenantId, req.auth?.centerId);
    res.json(summary);
  },
);
