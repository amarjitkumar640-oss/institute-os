import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createEnrollmentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { BatchFullError, createEnrollment } from "./enrollments.service";

export const enrollmentsRouter = Router();

// GET /enrollments?studentId=xxx  — list a student's active enrollments with batch info
enrollmentsRouter.get(
  "/",
  requireAuth,
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
  requireRole("admin", "frontdesk"),
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
      res.status(201).json(enrollment);
    } catch (err) {
      if (err instanceof BatchFullError) {
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
