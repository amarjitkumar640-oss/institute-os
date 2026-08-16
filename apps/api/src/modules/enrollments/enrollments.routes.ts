import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createEnrollmentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody } from "../../middleware/validate";
import { AlreadyEnrolledError, BatchFullError, createEnrollment, dropEnrollment, transferEnrollment } from "./enrollments.service";
import { notifyEnrollmentEvents } from "../notifications/notification.service";

export const enrollmentsRouter = Router();

// GET /enrollments?studentId=xxx  — list a student's active enrollments with batch info
// Mapped to the "students" screen (this is a student-record view, filtered
// by studentId), not "batches" — no dedicated "enrollments" screen exists.
enrollmentsRouter.get(
  "/",
  requireAuth,
  requirePermission("students", "read"),
  async (req, res) => {
    const { studentId } = req.query as { studentId?: string };
    if (!studentId) return res.status(400).json({ error: "studentId query param required" });

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: "active", student: { tenantId: req.auth!.tenantId } },
      include: {
        batch: {
          include: {
            course: { include: { examCategories: { include: { examCategory: true } } } },
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: { enrolledOn: "desc" },
    });

    return res.json(
      enrollments.map((e) => {
        const { examCategories, ...courseRest } = e.batch.course;
        return {
          id: e.id,
          enrolledOn: e.enrolledOn,
          status: e.status,
          batch: {
            ...e.batch,
            course: { ...courseRest, examCategories: examCategories.map((ec) => ec.examCategory) },
            enrolledCount: e.batch._count.enrollments,
            _count: undefined,
          },
        };
      })
    );
  }
);

enrollmentsRouter.post(
  "/",
  requireAuth,
  requirePermission("students", "edit"),
  validateBody(createEnrollmentSchema),
  async (req, res) => {
    const { studentId, batchId } = req.body;
    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: req.auth!.tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    try {
      const enrollment = await prisma.$transaction(
        (tx) => createEnrollment(tx, studentId, batchId, req.auth!.tenantId),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      await notifyEnrollmentEvents(prisma, req.auth!.tenantId, batchId).catch(console.error);
      res.status(201).json(enrollment);
    } catch (err) {
      if (err instanceof BatchFullError || err instanceof AlreadyEnrolledError) {
        return res.status(409).json({ error: err.message });
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return res.status(409).json({ error: "Student already enrolled in this batch" });
      }
      throw err;
    }
  }
);

// POST /enrollments/:id/drop — student is discontinuing this batch (not
// necessarily the institute). Soft status change, fee history untouched.
enrollmentsRouter.post(
  "/:id/drop",
  requireAuth,
  requirePermission("students", "edit"),
  async (req, res) => {
    const existing = await prisma.enrollment.findFirst({
      where: { id: req.params.id, student: { tenantId: req.auth!.tenantId } },
    });
    if (!existing) return res.status(404).json({ error: "Enrollment not found" });
    if (existing.status === "dropped") {
      return res.status(409).json({ error: "Student is already removed from this batch" });
    }

    const enrollment = await dropEnrollment(prisma, existing.id);
    res.json(enrollment);
  }
);

// POST /enrollments/:id/transfer — student is moving to a different batch.
// Creates the new enrollment and drops the old one in one transaction.
enrollmentsRouter.post(
  "/:id/transfer",
  requireAuth,
  requirePermission("students", "edit"),
  async (req, res) => {
    const { toBatchId } = req.body as { toBatchId?: string };
    if (!toBatchId) return res.status(400).json({ error: "toBatchId is required" });

    const existing = await prisma.enrollment.findFirst({
      where: { id: req.params.id, student: { tenantId: req.auth!.tenantId } },
    });
    if (!existing) return res.status(404).json({ error: "Enrollment not found" });
    if (existing.status !== "active") {
      return res.status(409).json({ error: "This enrollment is not active" });
    }
    if (existing.batchId === toBatchId) {
      return res.status(400).json({ error: "Student is already in this batch" });
    }

    try {
      const newEnrollment = await prisma.$transaction(
        (tx) => transferEnrollment(tx, existing, toBatchId, req.auth!.tenantId),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      await notifyEnrollmentEvents(prisma, req.auth!.tenantId, toBatchId).catch(console.error);
      res.status(201).json(newEnrollment);
    } catch (err) {
      if (err instanceof BatchFullError) return res.status(409).json({ error: err.message });
      if (err instanceof AlreadyEnrolledError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }
);
