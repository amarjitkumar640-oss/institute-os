import { Router } from "express";
import multer from "multer";
import { createStudentSchema, admitStudentSchema, updateStudentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { uploadPhoto } from "../../lib/s3";
import { generateStudentCode } from "./students.service";
import { centerFilter, centerIdForCreate } from "../../lib/centerFilter";
import { BatchFullError, createEnrollment } from "../enrollments/enrollments.service";

const upload = multer({ storage: multer.memoryStorage() });

export const studentsRouter = Router();

studentsRouter.get("/", requireAuth, async (req, res) => {
  const { batchId } = req.query as { batchId?: string };
  if (batchId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { batchId, status: "active" },
      include: { student: true },
    });
    return res.json(enrollments.map((e) => e.student));
  }
  const students = await prisma.student.findMany({
    where:   centerFilter(req),
    include: { center: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(students);
});

studentsRouter.get("/:id", requireAuth, async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { enrollments: { include: { batch: true } } },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json(student);
});

studentsRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createStudentSchema),
  async (req, res) => {
    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
    const studentCode = await generateStudentCode(prisma);
    const student = await prisma.student.create({
      data: { ...req.body, studentCode, centerId },
    });
    res.status(201).json(student);
  }
);

// ── POST /admit — full admission form: creates student + optional enrollment ──

studentsRouter.post(
  "/admit",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(admitStudentSchema),
  async (req, res) => {
    const { batchId, amountPaid, ...studentData } = req.body;

    try {
      const centerId = centerIdForCreate(req, req.body.centerId);
      if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });

      const result = await prisma.$transaction(async (tx) => {
        const studentCode = await generateStudentCode(tx as any);
        const student = await tx.student.create({
          data: {
            studentCode,
            centerId,
            fullName:           studentData.fullName,
            phone:              studentData.phone,
            email:              studentData.email ?? null,
            dob:                studentData.dob ?? null,
            address:            studentData.address ?? null,
            guardianPhone:      studentData.guardianPhone ?? null,
            aadhaar:            studentData.aadhaar ?? null,
            gender:             studentData.gender ?? null,
            fatherName:         studentData.fatherName ?? null,
            motherName:         studentData.motherName ?? null,
            guardianOccupation: studentData.guardianOccupation ?? null,
            guardianEmail:      studentData.guardianEmail ?? null,
            qualification:      studentData.qualification ?? null,
            passYear:           studentData.passYear ?? null,
            board:              studentData.board ?? null,
            whatsapp:           studentData.whatsapp ?? null,
            coursePreference:   studentData.coursePreference ?? null,
            durationPreference: studentData.durationPreference ?? null,
            preferredTiming:    studentData.preferredTiming ?? null,
            paymentMode:        studentData.paymentMode ?? null,
            amountPaid:         amountPaid ?? null,
          },
        });

        let enrollment = null;
        if (batchId) {
          enrollment = await createEnrollment(tx as any, student.id, batchId);
        }

        return { student, enrollment };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BatchFullError) {
        return res.status(409).json({ batchFull: true, message: err.message });
      }
      throw err;
    }
  }
);

studentsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(updateStudentSchema),
  async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  }
);

studentsRouter.post(
  "/:id/photo",
  requireAuth,
  requireRole("admin", "frontdesk"),
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing photo file" });
    const key = `students/${req.params.id}/${Date.now()}-${req.file.originalname}`;
    const photoUrl = await uploadPhoto(key, req.file.buffer, req.file.mimetype);
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { photoUrl },
    });
    res.json(student);
  }
);
