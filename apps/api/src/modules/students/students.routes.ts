import { Router } from "express";
import multer from "multer";
import { createStudentSchema, admitStudentSchema, updateStudentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody } from "../../middleware/validate";
import { deletePhoto, uploadPhoto, s3PathPrefix } from "../../lib/s3";
import { generateStudentCode, withPhotoUrl, withPhotoUrls, serializeStudentDocument, serializeStudentDocuments } from "./students.service";
import { centerIdForCreate, tenantIdForCreate, assignedCenterIds } from "../../lib/centerFilter";
import { maskPhoneFields, shouldMaskPhoneForRole } from "../../lib/phone";
import { BatchFullError, createEnrollment } from "../enrollments/enrollments.service";
import { ApplicationAlreadyProcessedError, ApplicationNotFoundError } from "../admissions/admissions.errors";
import { generateReceiptNo, generateSchedule } from "../fees/fees.service";
import { notifyEnrollmentEvents } from "../notifications/notification.service";

const upload = multer({ storage: multer.memoryStorage() });

export const studentsRouter = Router();

studentsRouter.get("/", requireAuth, requirePermission("students", "read"), async (req, res) => {
  const { batchId, centerId: requestedCenterId } = req.query as { batchId?: string; centerId?: string };
  const isTeacher  = req.auth!.activeRole === "teacher";
  const facultyId  = req.auth!.facultyId;

  // Resolve the batches a teacher is allowed to see.
  // For non-teachers this is null (no restriction beyond center).
  let teacherBatchIds: string[] | null = null;
  if (isTeacher && facultyId) {
    const slots = await prisma.classSlot.findMany({
      where:  { facultyId, batch: { tenantId: req.auth!.tenantId } },
      select: { batchId: true },
      distinct: ["batchId"],
    });
    teacherBatchIds = slots.map((s) => s.batchId);
  }

  if (batchId) {
    // Teachers may only query students in their own batches.
    if (teacherBatchIds !== null && !teacherBatchIds.includes(batchId)) {
      return res.json([]);
    }
    const enrollments = await prisma.enrollment.findMany({
      where: { batchId, status: "active", batch: { tenantId: req.auth!.tenantId } },
      include: { student: { include: { course: { select: { name: true } } } }, batch: { select: { id: true, name: true } } },
    });
    const maskPhone = shouldMaskPhoneForRole(req.auth!.activeRole);
    return res.json(await withPhotoUrls(enrollments.map((e) => maskPhoneFields({
      ...e.student,
      activeEnrollment: { id: e.id, batchId: e.batch.id, batchName: e.batch.name },
    }, ["phone", "guardianPhone"], maskPhone))));
  }

  // For teachers without any assigned batches, return empty.
  if (teacherBatchIds !== null && teacherBatchIds.length === 0) {
    return res.json([]);
  }

  // In all-centers mode a caller (e.g. the Add Student to Batch picker) can
  // narrow to one specific center — e.g. the batch's own center, so a batch
  // belonging to one branch doesn't offer students from every branch the
  // admin happens to be assigned to. Still intersected with this staff's own
  // assigned centers, never trusted blindly from the query string.
  const allowedCenterIds = await assignedCenterIds(req);
  const centerIds = requestedCenterId
    ? allowedCenterIds.filter((id) => id === requestedCenterId)
    : allowedCenterIds;

  const students = await prisma.student.findMany({
    where: {
      tenantId: req.auth!.tenantId,
      centerId: { in: centerIds },
      // Teachers see only students enrolled in their assigned batches.
      ...(teacherBatchIds !== null
        ? { enrollments: { some: { batchId: { in: teacherBatchIds }, status: "active" } } }
        : {}),
    },
    include: {
      center: { select: { id: true, name: true } },
      course: { select: { name: true } },
      enrollments: {
        where:   { status: "active" },
        include: { batch: { select: { id: true, name: true } } },
        take:    1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const maskPhone = shouldMaskPhoneForRole(req.auth!.activeRole);
  const withActiveEnrollment = students.map(({ enrollments, ...student }) => maskPhoneFields({
    ...student,
    activeEnrollment: enrollments[0]
      ? { id: enrollments[0].id, batchId: enrollments[0].batch.id, batchName: enrollments[0].batch.name }
      : null,
  }, ["phone", "guardianPhone"], maskPhone));
  res.json(await withPhotoUrls(withActiveEnrollment));
});

studentsRouter.get("/:id", requireAuth, requirePermission("students", "read"), async (req, res) => {
  const student = await prisma.student.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId },
    include: { enrollments: { include: { batch: true } } },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  const masked = maskPhoneFields(student, ["phone", "guardianPhone"], shouldMaskPhoneForRole(req.auth!.activeRole));
  res.json(await withPhotoUrl(masked));
});

studentsRouter.post(
  "/",
  requireAuth,
  requirePermission("students", "write"),
  validateBody(createStudentSchema),
  async (req, res) => {
    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
    const tenantId = tenantIdForCreate(req);
    const studentCode = await generateStudentCode(prisma, tenantId);
    const student = await prisma.student.create({
      data: { ...req.body, studentCode, centerId, tenantId },
    });
    res.status(201).json(await withPhotoUrl(student));
  }
);

// ── POST /admit — full admission form: creates student + optional enrollment ──

studentsRouter.post(
  "/admit",
  requireAuth,
  requirePermission("students", "write"),
  validateBody(admitStudentSchema),
  async (req, res) => {
    const { batchId, amountPaid, tcAcknowledged: _tc, applicationId, ...studentData } = req.body;

    try {
      const centerId = centerIdForCreate(req, req.body.centerId);
      if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
      const tenantId = tenantIdForCreate(req);

      const result = await prisma.$transaction(async (tx) => {
        if (applicationId) {
          const application = await (tx as any).admissionApplication.findFirst({ where: { id: applicationId, tenantId } });
          if (!application) throw new ApplicationNotFoundError();
          if (application.status !== "pending") throw new ApplicationAlreadyProcessedError(application.status);
        }

        const studentCode = await generateStudentCode(tx as any, tenantId);
        const student = await tx.student.create({
          data: {
            tenantId,
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
            courseId:           studentData.courseId ?? null,
            coursePreference:   studentData.coursePreference ?? null,
            durationPreference: studentData.durationPreference ?? null,
            preferredTiming:    studentData.preferredTiming ?? null,
            paymentMode:        studentData.paymentMode ?? null,
            amountPaid:         amountPaid ?? null,
            tcAcknowledgedAt:   req.body.tcAcknowledged ? new Date() : null,
          },
        });

        if (applicationId) {
          await (tx as any).admissionApplication.update({
            where: { id: applicationId },
            data:  { status: "admitted", studentId: student.id, reviewedById: req.auth!.staffId, reviewedAt: new Date() },
          });
        }

        let enrollment = null;
        if (batchId) {
          // Fetch batch → course → fee template before creating enrollment
          const batch = await (tx as any).batch.findFirst({
            where:   { id: batchId, tenantId },
            include: { course: { include: { feeTemplate: { include: { lines: { orderBy: { sortOrder: "asc" } } } } } } },
          });

          enrollment = await createEnrollment(tx as any, student.id, batchId, tenantId);

          const paid       = amountPaid ? Number(amountPaid) : 0;
          const today      = new Date();
          today.setHours(0, 0, 0, 0);
          const txnMode    = studentData.paymentMode === "cash" ? "cash" : "upi";
          const feeTemplate = batch?.course?.feeTemplate;
          const totalFee    = Number(batch?.course?.defaultFee ?? 0);

          if (feeTemplate && feeTemplate.lines.length > 0) {
            // Generate full installment schedule from course fee template
            const schedule = await generateSchedule(tx as any, enrollment.id, { totalFee, discountAmount: 0 }, tenantId);

            if (paid > 0) {
              // Apply admission payment to first installment
              const firstInst = schedule.installments[0];
              const applying  = Math.min(paid, Number(firstInst.plannedAmount));
              const newStatus = applying >= Number(firstInst.plannedAmount) ? "paid" : "partial";

              await (tx as any).scheduleInstallment.update({
                where: { id: firstInst.id },
                data:  { paidAmount: applying, status: newStatus },
              });

              await (tx as any).paymentTransaction.create({
                data: {
                  tenantId,
                  scheduleId:    schedule.id,
                  installmentId: firstInst.id,
                  amount:        paid,
                  mode:          txnMode,
                  type:          "payment",
                  receiptNo:     generateReceiptNo(),
                  paidAt:        today,
                  collectedById: req.auth?.staffId ?? null,
                },
              });

              // Mark schedule active/completed based on total paid
              await (tx as any).studentFeeSchedule.update({
                where: { id: schedule.id },
                data:  { status: paid >= totalFee ? "completed" : "active" },
              });
            }
          } else if (paid > 0) {
            // No fee template — create a simple admission payment record
            const schedule = await (tx as any).studentFeeSchedule.create({
              data: {
                enrollmentId:   enrollment.id,
                totalFee:       paid,
                discountAmount: 0,
                effectiveFee:   paid,
                creditBalance:  0,
                status:         "completed",
                installments: {
                  create: [{
                    sortOrder:     0,
                    label:         "Admission Payment",
                    plannedAmount: paid,
                    paidAmount:    paid,
                    dueDate:       today,
                    status:        "paid",
                  }],
                },
              },
              include: { installments: true },
            });

            await (tx as any).paymentTransaction.create({
              data: {
                tenantId,
                scheduleId:    schedule.id,
                installmentId: schedule.installments[0].id,
                amount:        paid,
                mode:          txnMode,
                type:          "payment",
                receiptNo:     generateReceiptNo(),
                paidAt:        today,
                collectedById: req.auth?.staffId ?? null,
              },
            });
          }
        }

        return { student, enrollment };
      });

      if (result.enrollment) {
        await notifyEnrollmentEvents(prisma, tenantId, result.enrollment.batchId).catch(console.error);
      }
      res.status(201).json({ ...result, student: await withPhotoUrl(result.student) });
    } catch (err) {
      if (err instanceof BatchFullError) {
        return res.status(409).json({ batchFull: true, message: err.message });
      }
      if (err instanceof ApplicationNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof ApplicationAlreadyProcessedError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }
);

studentsRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("students", "edit"),
  validateBody(updateStudentSchema),
  async (req, res) => {
    const student = await prisma.student.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(await withPhotoUrl(updated));
  }
);

studentsRouter.post(
  "/:id/photo",
  requireAuth,
  requirePermission("students", "edit"),
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing photo file" });
    const existing = await prisma.student.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!existing) return res.status(404).json({ error: "Student not found" });
    const key = `${s3PathPrefix(existing.tenantId, existing.centerId)}/students/${req.params.id}/${Date.now()}-${req.file.originalname}`;
    await uploadPhoto(key, req.file.buffer, req.file.mimetype);
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { photoUrl: key },
    });
    res.json(await withPhotoUrl(student));
  }
);

studentsRouter.delete(
  "/:id/photo",
  requireAuth,
  requirePermission("students", "delete"),
  async (req, res) => {
    const existing = await prisma.student.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!existing) return res.status(404).json({ error: "Student not found" });

    if (existing.photoUrl) {
      // Best-effort — don't let a missing/already-gone S3 object block clearing the DB field.
      await deletePhoto(existing.photoUrl).catch(() => {});
    }

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { photoUrl: null },
    });
    res.json(await withPhotoUrl(student));
  }
);

// ── Documents (Aadhar scan, marksheet, etc.) — dynamic, master-data-driven ────

// Mapped to "edit" rather than "read" — unlike the base student profile
// (open to teachers too), document access has always been admin/frontdesk
// only; using the same "read" flag as GET / would incorrectly open this to
// teacher, who has students.read=true but students.edit=false.
studentsRouter.get(
  "/:id/documents",
  requireAuth,
  requirePermission("students", "edit"),
  async (req, res) => {
    const student = await prisma.student.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const docs = await prisma.studentDocument.findMany({
      where:   { studentId: req.params.id },
      include: { documentType: true },
      orderBy: { documentType: { sortOrder: "asc" } },
    });
    res.json(await serializeStudentDocuments(docs));
  }
);

studentsRouter.post(
  "/:id/documents/:documentTypeId",
  requireAuth,
  requirePermission("students", "edit"),
  upload.single("document"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing document file" });
    const { id: studentId, documentTypeId } = req.params;

    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: req.auth!.tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const existing = await prisma.studentDocument.findUnique({
      where: { studentId_documentTypeId: { studentId, documentTypeId } },
    });
    if (existing) {
      // Best-effort — don't let a missing/already-gone S3 object block replacing the row.
      await deletePhoto(existing.fileUrl).catch(() => {});
    }

    const key = `${s3PathPrefix(student.tenantId, student.centerId)}/student-docs/${documentTypeId}/${studentId}/${Date.now()}-${req.file.originalname}`;
    await uploadPhoto(key, req.file.buffer, req.file.mimetype);

    const doc = await prisma.studentDocument.upsert({
      where:   { studentId_documentTypeId: { studentId, documentTypeId } },
      update:  { fileUrl: key },
      create:  { studentId, documentTypeId, fileUrl: key },
      include: { documentType: true },
    });
    res.json(await serializeStudentDocument(doc));
  }
);

studentsRouter.delete(
  "/:id/documents/:documentTypeId",
  requireAuth,
  requirePermission("students", "delete"),
  async (req, res) => {
    const { id: studentId, documentTypeId } = req.params;
    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: req.auth!.tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const existing = await prisma.studentDocument.findUnique({
      where: { studentId_documentTypeId: { studentId, documentTypeId } },
    });
    if (!existing) return res.status(404).json({ error: "Document not found" });

    await deletePhoto(existing.fileUrl).catch(() => {});
    await prisma.studentDocument.delete({
      where: { studentId_documentTypeId: { studentId, documentTypeId } },
    });
    res.json({ deleted: true });
  }
);
