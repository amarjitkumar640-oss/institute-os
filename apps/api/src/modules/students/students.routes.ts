import { Router } from "express";
import multer from "multer";
import type { ZodIssue } from "zod";
import { createStudentSchema, admitStudentSchema, updateStudentSchema, bulkImportLegacyStudentsSchema, legacyStudentSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody } from "../../middleware/validate";
import { deletePhoto, uploadPhoto, s3PathPrefix } from "../../lib/s3";
import { generateStudentCode, withPhotoUrl, withPhotoUrls, serializeStudentDocument, serializeStudentDocuments } from "./students.service";
import { importLegacyStudent, describeLegacyImportError } from "./legacy-import.service";
import { centerIdForCreate, tenantIdForCreate, assignedCenterIds } from "../../lib/centerFilter";
import { maskPhoneFields, shouldMaskPhoneForRole } from "../../lib/phone";
import { BatchFullError, createEnrollment } from "../enrollments/enrollments.service";
import { ApplicationAlreadyProcessedError, ApplicationNotFoundError } from "../admissions/admissions.errors";
import { generateReceiptNo, generateSchedule } from "../fees/fees.service";
import { findRedeemableOffer, redeemOffer } from "../batches/offers.service";
import { findActiveContractForBatch } from "../sponsors/sponsors.service";
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
    const studentCode = await generateStudentCode(prisma, tenantId, centerId);
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
    const {
      batchId, amountPaid, tcAcknowledged: _tc, applicationId,
      discountAmount: manualDiscountAmount, discountReason: manualDiscountReason,
      ...studentData
    } = req.body;

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

        const studentCode = await generateStudentCode(tx as any, tenantId, centerId);
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

          // A course flagged isFree (a dedicated CSR-only course), or a batch
          // under an active SponsorshipContract (a specific batch inside an
          // otherwise-normal course, sponsored end-to-end by one company),
          // is never billed to the student at all — no fee schedule, no
          // payment recorded, regardless of what amountPaid/paymentMode were
          // sent. A sponsored batch is always fully sponsored (see
          // schema.prisma's SponsorshipContract comment), so this check is
          // the same for every admission into it.
          const activeContract = batch?.course?.isFree
            ? null
            : await findActiveContractForBatch(tx as any, batchId);
          const isSponsored = !!(batch?.course?.isFree || activeContract);

          const paid       = amountPaid ? Number(amountPaid) : 0;
          const today      = new Date();
          today.setHours(0, 0, 0, 0);
          const txnMode    = studentData.paymentMode === "cash" ? "cash" : "upi";
          const feeTemplate    = batch?.course?.feeTemplate;
          const totalFee       = Number(batch?.course?.defaultFee ?? 0);

          if (!isSponsored) {
            // Discount precedence, highest first:
            //  1. A manual discount typed in on this specific admission —
            //     an explicit staff override for this student only. Doesn't
            //     touch the batch offer or course config, and doesn't consume
            //     an offer redemption slot (the offer wasn't actually used).
            //  2. An active "first N students in this batch" offer with
            //     remaining slots (more specific/deliberate promo than a
            //     blanket course discount, so it wins while stock lasts).
            //  3. The course's standing discount, once the offer is exhausted
            //     or inactive.
            // A one-off discount is also still available *after* admission via
            // applyDiscount (fees.service.ts), independent of all of this.
            const redeemableOffer = manualDiscountAmount === undefined
              ? await findRedeemableOffer(tx as any, batchId)
              : null;
            let discountAmount: number;
            let discountReason: string | undefined;
            if (manualDiscountAmount !== undefined) {
              discountAmount = Number(manualDiscountAmount);
              discountReason = manualDiscountReason ?? undefined;
            } else if (redeemableOffer) {
              discountAmount = Number(redeemableOffer.discountAmount);
              discountReason = "Batch discount offer";
            } else {
              discountAmount = Number(batch?.course?.discountAmount ?? 0);
              discountReason = batch?.course?.discountReason ?? undefined;
            }

            if (feeTemplate && feeTemplate.lines.length > 0) {
              // Generate full installment schedule from course fee template
              const schedule = await generateSchedule(tx as any, enrollment.id, { totalFee, discountAmount, discountReason }, tenantId);

              // Only consume a redemption slot once the offer's discount is
              // actually being granted (this branch) — the no-template branch
              // below ignores discountAmount entirely, so an offer must never
              // be redeemed there. A manual override never redeems the offer
              // (redeemableOffer is null in that case already).
              if (redeemableOffer) await redeemOffer(tx as any, redeemableOffer.id);

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

                // Mark schedule active/completed based on total paid against the
                // discounted effectiveFee, not the undiscounted totalFee — a
                // fully-paid discounted schedule would otherwise stay "active"
                // forever whenever discountAmount > 0.
                await (tx as any).studentFeeSchedule.update({
                  where: { id: schedule.id },
                  data:  { status: paid >= totalFee - discountAmount ? "completed" : "active" },
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
      if (err instanceof Error && err.message === "DISCOUNT_EXCEEDS_FEE") {
        return res.status(422).json({ error: "Discount cannot exceed the course fee" });
      }
      throw err;
    }
  }
);

// Turns Zod's raw (non-flattened) issue list for one student into one
// short, specific line — e.g. "payment #2 — amount: Required" instead of
// validateBody's usual whole-request flatten(), which would merge every
// issue from every student in the batch into one undifferentiated pile
// with no way to tell which row or field any single message belongs to.
function describeStudentValidationIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const [first, second, third] = issue.path;
      if (first === "payments" && typeof second === "number") {
        return `payment #${second + 1} — ${third ?? "value"}: ${issue.message}`;
      }
      return `${issue.path.join(".") || "value"}: ${issue.message}`;
    })
    .join("; ");
}

// ── POST /bulk-import-legacy — backfill students + payment history from a
// pre-system paper register into an already-existing batch. See
// legacy-import.service.ts for why each row skips the course's fee
// template. Only the envelope (batchId/centerId/students-is-an-array) is
// validated up front — each student is parsed against legacyStudentSchema
// individually below, and imported in its own transaction, so one bad or
// incomplete row (a missing field, a batch-capacity conflict, ...) is
// reported specifically against that row instead of rejecting the whole
// batch or producing an unreadable combined error.

studentsRouter.post(
  "/bulk-import-legacy",
  requireAuth,
  requirePermission("students", "write"),
  validateBody(bulkImportLegacyStudentsSchema),
  async (req, res) => {
    const centerId = centerIdForCreate(req, req.body.centerId);
    if (!centerId) return res.status(400).json({ error: "centerId required when using all-centers mode" });
    const tenantId = tenantIdForCreate(req);

    const batch = await prisma.batch.findFirst({ where: { id: req.body.batchId, tenantId } });
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const results: Array<
      | { index: number; success: true; studentId: string; studentCode: string }
      | { index: number; success: false; error: string }
    > = [];

    for (let index = 0; index < req.body.students.length; index++) {
      const parsed = legacyStudentSchema.safeParse(req.body.students[index]);
      if (!parsed.success) {
        results.push({ index, success: false, error: describeStudentValidationIssues(parsed.error.issues) });
        continue;
      }
      try {
        const student = await prisma.$transaction((tx) =>
          importLegacyStudent(tx, { tenantId, centerId, batchId: batch.id, defaultCourseId: batch.courseId, staffId: req.auth!.staffId, input: parsed.data })
        );
        results.push({ index, success: true, studentId: student.id, studentCode: student.studentCode });
      } catch (err) {
        results.push({ index, success: false, error: describeLegacyImportError(err) });
      }
    }

    res.json({ results });
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
