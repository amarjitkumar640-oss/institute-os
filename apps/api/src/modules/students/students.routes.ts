import { Router } from "express";
import multer from "multer";
import { createStudentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { uploadPhoto } from "../../lib/s3";
import { generateStudentCode } from "./students.service";

const upload = multer({ storage: multer.memoryStorage() });

export const studentsRouter = Router();

studentsRouter.get("/", requireAuth, async (_req, res) => {
  const students = await prisma.student.findMany();
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
    const studentCode = await generateStudentCode(prisma);
    const student = await prisma.student.create({
      data: { ...req.body, studentCode },
    });
    res.status(201).json(student);
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
