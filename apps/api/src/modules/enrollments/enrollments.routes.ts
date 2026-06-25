import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createEnrollmentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { BatchFullError, createEnrollment } from "./enrollments.service";

export const enrollmentsRouter = Router();

enrollmentsRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createEnrollmentSchema),
  async (req, res) => {
    const { studentId, batchId } = req.body;
    try {
      const enrollment = await prisma.$transaction(
        (tx) => createEnrollment(tx, studentId, batchId),
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
