import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateQuery } from "../../middleware/validate";
import { assignedCenterIds } from "../../lib/centerFilter";
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
  getCollectionSummary,
  getCollectionByBatch,
  computeScheduleOutstanding,
  periodStart,
  type CollectionPeriod,
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
  requirePermission("fees", "read"),
  async (req, res) => {
    const template = await getFeeTemplate(prisma, req.params.courseId, req.auth!.tenantId);
    if (!template) return res.status(404).json({ error: "No template for this course" });
    res.json(template);
  },
);

feesRouter.post(
  "/templates/:courseId",
  requireAuth,
  requirePermission("fees", "edit"),
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
  requirePermission("fees", "read"),
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
    const data = await listSchedules(prisma, req.auth!.tenantId, await assignedCenterIds(req), { search, status, batchId });
    const mapped = data.map((s) => {
      const paidAmount = s.installments.reduce((sum, i) => sum + Number(i.paidAmount), 0);
      const pendingAmount = computeScheduleOutstanding(
        Number(s.effectiveFee), Number(s.creditBalance),
        s.installments.map((i) => ({ paidAmount: Number(i.paidAmount), waivedAmount: Number(i.waivedAmount) })),
      );
      return {
        id: s.id,
        enrollmentId: s.enrollmentId,
        totalFee: Number(s.totalFee),
        discountAmount: Number(s.discountAmount),
        effectiveFee: Number(s.effectiveFee),
        creditBalance: Number(s.creditBalance),
        status: s.status,
        student: s.enrollment.student,
        batch: s.enrollment.batch,
        paidAmount,
        pendingAmount,
      };
    });
    res.json(mapped);
  },
);

feesRouter.get(
  "/schedules/:enrollmentId",
  requireAuth,
  requirePermission("fees", "read"),
  async (req, res) => {
    const schedule = await getScheduleDetail(prisma, req.params.enrollmentId, req.auth!.tenantId);
    if (!schedule) return res.status(404).json({ error: "No fee schedule for this enrollment" });
    res.json(schedule);
  },
);

feesRouter.post(
  "/schedules/:enrollmentId/generate",
  requireAuth,
  requirePermission("fees", "write"),
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
  requirePermission("fees", "edit"),
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
  requirePermission("fees", "edit"),
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
  requirePermission("fees", "write"),
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
  requirePermission("fees", "read"),
  validateQuery(
    z.object({
      scheduleId: z.string().uuid().optional(),
      period:     z.enum(["today", "week", "month", "year"]).optional(),
      batchId:    z.string().uuid().optional(),
    }),
  ),
  async (req, res) => {
    const { scheduleId, batchId } = req.query as { scheduleId?: string; batchId?: string };
    const period = (req.query.period as CollectionPeriod | undefined) ?? "today";

    // scheduleId scopes to one student's history; otherwise this is a
    // period-based drill-down (from a Collection-tab card or batch row) —
    // reuses fees.service.ts's own periodStart() so the list's total can
    // never disagree with the summary number the user clicked into.
    const where = scheduleId
      ? { scheduleId, tenantId: req.auth!.tenantId }
      : {
          tenantId: req.auth!.tenantId,
          type:     "payment" as const,
          paidAt:   { gte: periodStart(period, new Date()), lte: new Date() },
          schedule: {
            enrollment: {
              batch: {
                centerId: { in: await assignedCenterIds(req) },
                ...(batchId ? { id: batchId } : {}),
              },
            },
          },
        };

    const payments = await prisma.paymentTransaction.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take:    200,
      include: {
        collectedBy: { select: { id: true, fullName: true } },
        installment: { select: { id: true, label: true } },
        schedule:    { select: { enrollment: { select: {
          student: { select: { id: true, fullName: true } },
          batch:   { select: { id: true, name: true } },
        } } } },
      },
    });
    res.json(payments);
  },
);

// ── Dashboard summary ─────────────────────────────────────────────────────────

feesRouter.get(
  "/summary",
  requireAuth,
  requirePermission("fees", "read"),
  async (req, res) => {
    const summary = await getFeeSummary(prisma, req.auth!.tenantId, await assignedCenterIds(req));
    res.json({
      totalCollected: summary.collectedThisMonth,
      totalPending: summary.pending,
      overdueCount: summary.overdueCount,
    });
  },
);

// ── Collection dashboard (today/week/month/year + batch-wise) ────────────────

feesRouter.get(
  "/collection-summary",
  requireAuth,
  requirePermission("fees", "read"),
  async (req, res) => {
    const summary = await getCollectionSummary(prisma, req.auth!.tenantId, await assignedCenterIds(req));
    res.json(summary);
  },
);

feesRouter.get(
  "/collection-by-batch",
  requireAuth,
  requirePermission("fees", "read"),
  validateQuery(z.object({ period: z.enum(["today", "week", "month", "year"]) })),
  async (req, res) => {
    const { period } = req.query as { period: "today" | "week" | "month" | "year" };
    const data = await getCollectionByBatch(prisma, req.auth!.tenantId, await assignedCenterIds(req), period);
    res.json(data);
  },
);
