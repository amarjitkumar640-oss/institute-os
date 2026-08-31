import { z } from "zod";

export const staffRoleSchema = z.enum(["admin", "teacher", "frontdesk"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const batchStatusSchema = z.enum(["upcoming", "running", "completed", "merged"]);
export const enrollmentStatusSchema = z.enum(["active", "paused", "completed", "dropped"]);
export const leadStatusSchema = z.enum(["new", "contacted", "visited", "converted", "lost"]);

// The whole app only ever deals in plain 10-digit Indian mobile numbers (no
// country-code UI anywhere), so phone handling stays simple: strip
// everything but digits, no "+"/E.164 normalization. Still useful for
// tolerating loosely-formatted phone input at login.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const staffLoginMethodSchema = z.enum(["phone", "email_username"]);
export type StaffLoginMethod = z.infer<typeof staffLoginMethodSchema>;

// The organization is known up front (baked into the app build), so login no
// longer needs to guess a format or resolve a tenant from a bare identifier —
// it just needs to know which tenant to look the identifier up within.
export const loginSchema = z.object({
  tenantId:   z.string().uuid(),
  identifier: z.string().trim().min(1, "Enter your email, username, or phone number"),
  password:   z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(120),
  examCategoryIds: z.array(z.string().uuid()).default([]),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  examCategoryIds: z.array(z.string().uuid()).optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const subjectQuerySchema = z.object({
  examCategoryId: z.string().uuid().optional(),
  search:         z.string().max(100).optional(),
});

export const createCourseSchema = z.object({
  name: z.string().min(1).max(120),
  examCategoryIds: z.array(z.string().uuid()).default([]),
  durationMonths: z.number().int().positive().max(60),
  defaultFee: z.number().nonnegative().max(10_000_000),
  discountAmount: z.number().nonnegative().max(10_000_000).default(0),
  discountReason: z.string().max(300).optional(),
  // A course that's never billed to students at all (e.g. a dedicated CSR
  // program course) — admission into any batch under it skips fee-schedule
  // generation entirely.
  isFree: z.boolean().default(false),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const courseQuerySchema = z.object({
  examCategoryId: z.string().uuid().optional(),
  search:         z.string().max(100).optional(),
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().positive().max(100).default(20),
});

export const createBatchSchema = z.object({
  courseId:  z.string().uuid(),
  name:      z.string().min(1).max(120),
  capacity:  z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
  centerId:  z.string().uuid().optional(),
});

export const updateBatchSchema = z.object({
  name:      z.string().min(1).max(120).optional(),
  capacity:  z.number().int().positive().optional(),
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
  status:    batchStatusSchema.optional(),
});

// Every active enrollment in the source batch moves into the target batch
// (see modules/batches/batch-merge.service.ts) — no course-match
// requirement, no fee change, student's own courseId untouched.
export const mergeBatchSchema = z.object({
  toBatchId: z.string().uuid(),
});
export type MergeBatchInput = z.infer<typeof mergeBatchSchema>;

export const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  targetExamId: z.string().uuid(),
  source: z.string().min(1),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
  centerId: z.string().uuid().optional(),
});

export const convertLeadSchema = z.object({
  batchId:       z.string().uuid(),
  studentDob:    z.coerce.date().optional(),
  guardianPhone: z.string().optional(),
});

// ─── Faculty ─────────────────────────────────────────────────────────────────

export const createFacultySchema = z.object({
  fullName:        z.string().min(1).max(120),
  phone:           z.string().min(7).max(20),
  email:           z.string().email(),
  qualification:   z.string().min(1).max(200),
  experienceYears: z.number().int().min(0).max(50).default(0),
  joiningDate:     z.coerce.date(),
  subjectIds:      z.array(z.string().uuid()).default([]),
  centerId:        z.string().uuid().optional(),
});
export type CreateFacultyInput = z.infer<typeof createFacultySchema>;

export const updateFacultySchema = z.object({
  fullName:        z.string().min(1).max(120).optional(),
  phone:           z.string().min(7).max(20).optional(),
  email:           z.string().email().optional(),
  qualification:   z.string().min(1).max(200).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  joiningDate:     z.coerce.date().optional(),
  isActive:        z.boolean().optional(),
  subjectIds:      z.array(z.string().uuid()).optional(),
  staffId:         z.string().uuid().nullable().optional(),
});
export type UpdateFacultyInput = z.infer<typeof updateFacultySchema>;

export const facultyQuerySchema = z.object({
  search:         z.string().max(100).optional(),
  examCategoryId: z.string().uuid().optional(),
  isActive:       z.coerce.boolean().optional(),
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().positive().max(100).default(20),
});

export const createStudentSchema = z.object({
  fullName:      z.string().min(1),
  phone:         z.string().min(1),
  email:         z.string().email().nullable().optional(),
  dob:           z.coerce.date().nullable().optional(),
  address:       z.string().nullable().optional(),
  guardianPhone: z.string().nullable().optional(),
  centerId:      z.string().uuid().optional(),
});

export const admitStudentSchema = z.object({
  // Personal
  fullName:           z.string().min(1).max(120),
  phone:              z.string().min(7).max(20),
  email:              z.string().email().nullable().optional(),
  dob:                z.coerce.date(),
  address:            z.string().min(1).max(500),
  aadhaar:            z.string().min(1).max(20),
  gender:             z.enum(["male", "female"]),
  // Family
  fatherName:         z.string().max(120).nullable().optional(),
  motherName:         z.string().max(120).nullable().optional(),
  guardianOccupation: z.string().max(200).nullable().optional(),
  guardianEmail:      z.string().email().nullable().optional(),
  guardianPhone:      z.string().max(20).nullable().optional(),
  // Academic
  qualification:      z.enum(["class10", "class12", "graduation", "post_graduation"]).nullable().optional(),
  passYear:           z.string().max(4).nullable().optional(),
  board:              z.string().max(100).nullable().optional(),
  courseId:           z.string().uuid().nullable().optional(),
  coursePreference:   z.enum(["ssc", "banking", "railway", "foundation", "others"]).nullable().optional(),
  durationPreference: z.enum(["3months", "6months", "1year"]).nullable().optional(),
  whatsapp:           z.string().max(20).nullable().optional(),
  // Office use
  batchId:            z.string().uuid().nullable().optional(),
  preferredTiming:    z.enum(["morning", "midday", "evening"]).nullable().optional(),
  paymentMode:        z.enum(["cash", "online"]).nullable().optional(),
  amountPaid:         z.number().nonnegative().nullable().optional(),
  // Ad-hoc discount for THIS student only, set at admission time — takes
  // priority over both the batch's "first N" offer and the course's
  // standing discount when provided (an explicit staff override, not
  // something that consumes a batch offer redemption slot).
  discountAmount:     z.number().nonnegative().max(10_000_000).optional(),
  discountReason:     z.string().max(300).optional(),
  // T&C acknowledgment — front desk confirms student was informed
  tcAcknowledged:     z.boolean().optional(),
  centerId:           z.string().uuid().optional(),
  // Set when this admission is carried through from a self-service
  // AdmissionApplication — closes the loop by stamping studentId back onto it.
  applicationId:      z.string().uuid().nullable().optional(),
});
export type AdmitStudentInput = z.infer<typeof admitStudentSchema>;

export const updateStudentSchema = admitStudentSchema
  .omit({ batchId: true, applicationId: true, discountAmount: true, discountReason: true })
  .partial()
  // dob/address/aadhaar/gender are required (non-nullable) on admitStudentSchema
  // so a new admission can't skip them, but editing an existing student must
  // still be able to explicitly clear a previously-set value — re-widen just
  // these 4 back to nullable for the update path.
  .extend({
    dob:     z.coerce.date().nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    aadhaar: z.string().max(20).nullable().optional(),
    gender:  z.enum(["male", "female"]).nullable().optional(),
  })
  .refine((d) => !d.fullName || d.fullName.length >= 1, { path: ["fullName"], message: "Name required" });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid(),
});

// ─── Legacy student import (backfilling pre-system paper registers) ──────────
// One student + their full historical payment trail (each an already-paid
// installment, not a future due date) — see students/legacy-import.service.ts
// for how each row turns into a ScheduleInstallment + PaymentTransaction pair.
//
// Deliberately lenient: this is hand-transcribed from photos of paper
// registers, so almost nothing here is a hard requirement — only fullName,
// phone, and a payment's own amount are things the import genuinely can't
// proceed without. Everything else missing/malformed gets a sensible
// fallback (see legacy-import.service.ts) instead of rejecting the batch —
// that strictness belongs to the real Admit Student form (web/mobile/the
// public apply URL), not this backfill tool.

// A digit-heavy field (phone, pass year, Aadhaar, a register's own receipt
// no.) transcribed by hand into JSON is just as likely to be typed as a
// bare number as a quoted string — DB-wise these are all plain String
// columns, so cast either shape to a string instead of rejecting a number.
const numericString = (max: number) =>
  z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().max(max));

const paymentDateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Accepts "paidAt" as an alias for "date" — an AI-extraction pipeline
// transcribing straight from register photos is just as likely to use
// PaymentTransaction's own column name (paidAt) as the friendlier "date"
// this schema documents, and there's no reason to reject a whole payment
// over which one it picked.
export const legacyPaymentSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !("date" in raw) && "paidAt" in raw) {
      const { paidAt, ...rest } = raw as Record<string, unknown>;
      return { ...rest, date: paidAt };
    }
    return raw;
  },
  z.object({
    // Required, deliberately — unlike the other relaxed fields, a wrong or
    // silently-guessed payment date is a real error in a financial record,
    // not a cosmetic gap. Better to reject this one payment with a clear
    // "date: Required" than to guess "today" and quietly misdate it.
    date:      z.string().regex(paymentDateRegex, "Must be YYYY-MM-DD"),
    amount:    z.coerce.number().positive(),
    // The register's own receipt number, if you have it — kept only as a
    // reference note on the payment (see legacy-import.service.ts), never
    // stored as the actual receiptNo. Every imported payment gets a real
    // auto-generated one instead, the same generateReceiptNo() any payment
    // recorded live through web/mobile gets — so this is optional, and
    // never required to be unique.
    receiptNo: numericString(50).nullable().optional(),
  }),
);
export type LegacyPaymentInput = z.infer<typeof legacyPaymentSchema>;

export const legacyStudentSchema = z.object({
  // Required here, unlike Student.legacyId's own nullability at the DB
  // level — a student created through the normal Admit Student form
  // (mobile/web) never has one, but every row going through *this* backfill
  // path is by definition an old paper-register student, so a missing
  // legacyId here is a data-entry gap in the import file, not a valid state.
  legacyId:      numericString(50).refine((v) => v.length > 0, "Required for a legacy-imported student"),
  fullName:      z.string().min(1).max(120),
  fatherName:    z.string().max(120).nullable().optional(),
  motherName:    z.string().max(120).nullable().optional(),
  gender:        z.enum(["male", "female"]).nullable().optional(),
  address:       z.string().max(500).nullable().optional(),
  qualification: z.enum(["class10", "class12", "graduation", "post_graduation"]).nullable().optional(),
  passYear:      numericString(20).nullable().optional(),
  board:         z.string().max(100).nullable().optional(),
  email:         z.string().email().nullable().optional(),
  aadhaar:       numericString(20).nullable().optional(),
  phone:         numericString(20).pipe(z.string().min(7)),
  guardianPhone: numericString(20).nullable().optional(),
  // "Course Applied For" (Student.courseId) — same field the normal Admit
  // Student form sets independently of the batch they're placed in.
  // Defaults to the target batch's own course in the UI, but stays
  // per-student and overridable for the rare case a student's original
  // admission course doesn't match the batch they ended up in.
  courseId:      z.string().uuid().nullable().optional(),
  // Total course fee this student actually agreed to pay — defaults to the
  // batch's course fee in the UI, but kept per-student and editable so an
  // individual discount/negotiated rate can still be recorded accurately.
  // Missing entirely → the service falls back to the resolved course's own
  // defaultFee (the same number the UI would have pre-filled anyway), not
  // to the sum of payments — a partly-paid student's total shouldn't
  // default to "exactly what they've paid so far."
  totalFee:      z.coerce.number().positive().nullable().optional(),
  payments:      z.array(legacyPaymentSchema).default([]),
});
export type LegacyStudentInput = z.infer<typeof legacyStudentSchema>;

// The envelope only validates its own shape (batchId/centerId, and that
// `students` is a non-empty array of objects) — each student is validated
// individually against legacyStudentSchema inside the route handler
// instead of here, so one malformed row produces one clear, specific
// per-row error rather than rejecting the whole batch with an
// undifferentiated pile of "Required" (see students.routes.ts's
// bulk-import-legacy handler).
export const bulkImportLegacyStudentsSchema = z.object({
  batchId:  z.string().uuid(),
  centerId: z.string().uuid().optional(),
  students: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
});
export type BulkImportLegacyStudentsInput = z.infer<typeof bulkImportLegacyStudentsSchema>;

// ─── Admission Applications (public self-service form) ────────────────────────

// Student-fillable subset of admitStudentSchema. Deliberately excludes
// aadhaar (no ID numbers on an unauthenticated public page), plus everything
// that's frontdesk/office-use: batchId, preferredTiming, paymentMode,
// amountPaid, applicationId. `centerId` IS included here — unlike the admit
// flow, it's the applicant's own preference for which branch to attend, not
// an office assignment. `tcAccepted` replaces admitStudentSchema's optional
// `tcAcknowledged` with a required checkbox — the applicant's own acceptance
// of terms, not frontdesk confirming they informed someone.
export const submitAdmissionApplicationSchema = admitStudentSchema
  .pick({
    fullName: true,
    phone: true,
    email: true,
    dob: true,
    address: true,
    gender: true,
    fatherName: true,
    motherName: true,
    guardianOccupation: true,
    guardianEmail: true,
    guardianPhone: true,
    qualification: true,
    passYear: true,
    board: true,
    courseId: true,
    coursePreference: true,
    durationPreference: true,
    whatsapp: true,
    centerId: true,
  })
  .extend({
    tcAccepted: z.boolean().refine((v) => v === true, {
      message: "You must accept the terms and conditions to apply",
    }),
  });
export type SubmitAdmissionApplicationInput = z.infer<typeof submitAdmissionApplicationSchema>;

export const rejectAdmissionApplicationSchema = z.object({
  reason: z.string().min(1).max(300),
});
export type RejectAdmissionApplicationInput = z.infer<typeof rejectAdmissionApplicationSchema>;

// ─── Fee Templates ────────────────────────────────────────────────────────────

export const templateLineTypeSchema  = z.enum(["fixed", "percentage", "equal_split", "remaining"]);
export const templateTriggerSchema   = z.enum(["on_admission", "days_after_admission", "days_after_previous", "monthly_recurring"]);

export const createTemplateLineSchema = z.object({
  sortOrder:  z.number().int().min(0),
  label:      z.string().min(1).max(100),
  lineType:   templateLineTypeSchema,
  amount:     z.number().nonnegative().optional(),
  percentage: z.number().min(0).max(100).optional(),
  splitCount: z.number().int().positive().optional(),
  trigger:    templateTriggerSchema,
  offsetDays: z.number().int().min(0).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});
export type CreateTemplateLineInput = z.infer<typeof createTemplateLineSchema>;

export const upsertFeeTemplateSchema = z.object({
  notes: z.string().max(500).optional(),
  lines: z.array(createTemplateLineSchema).min(1),
});
export type UpsertFeeTemplateInput = z.infer<typeof upsertFeeTemplateSchema>;

// ─── Student Fee Schedule ─────────────────────────────────────────────────────

export const generateScheduleSchema = z.object({
  totalFee:       z.number().positive(),
  discountAmount: z.number().nonnegative().default(0),
  discountReason: z.string().max(300).optional(),
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // override; defaults to today
});
export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;

export const applyDiscountSchema = z.object({
  discountAmount: z.number().nonnegative(),
  discountReason: z.string().max(300).optional(),
});

export const editInstallmentSchema = z.object({
  label:         z.string().min(1).max(100).optional(),
  plannedAmount: z.number().positive().optional(),
  dueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  waivedAmount:  z.number().nonnegative().optional(),
  waivedReason:  z.string().max(300).optional(),
  lateFee:       z.number().nonnegative().optional(),
  notes:         z.string().max(500).optional(),
  status:        z.enum(["pending", "partial", "paid", "overdue", "waived", "deferred"]).optional(),
});
export type EditInstallmentInput = z.infer<typeof editInstallmentSchema>;

// ─── Payments ─────────────────────────────────────────────────────────────────

export const txnModeSchema = z.enum(["cash", "upi", "card", "bank_transfer", "cheque"]);

export const recordPaymentSchema = z.object({
  scheduleId:    z.string().uuid(),
  installmentId: z.string().uuid().optional(),   // null = advance / credit
  amount:        z.number().positive(),
  mode:          txnModeSchema,
  paidAt:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chequeNo:      z.string().max(50).optional(),
  bankName:      z.string().max(100).optional(),
  upiRef:        z.string().max(100).optional(),
  notes:         z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ── Class Schedule ─────────────────────────────────────────────────────────────

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24-hour)");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const dayOfWeekSchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

export const sessionStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);
export const sessionTypeSchema   = z.enum(["regular", "extra", "makeup"]);

export const createSlotSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  startTime: timeStr,
  endTime:   timeStr,
  subjectId: z.string().uuid().optional(),
  facultyId: z.string().uuid().optional(),
  room:      z.string().max(100).optional(),
  validFrom: dateStr,
  validTo:   dateStr.optional(),
});
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

export const updateSlotSchema = z.object({
  startTime: timeStr.optional(),
  endTime:   timeStr.optional(),
  subjectId: z.string().uuid().nullable().optional(),
  facultyId: z.string().uuid().nullable().optional(),
  room:      z.string().max(100).nullable().optional(),
  validTo:   dateStr.nullable().optional(),
  isActive:  z.boolean().optional(),
});
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;

export const generateSessionsSchema = z.object({
  from: dateStr,
  to:   dateStr,
});
export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;

export const createAdHocSessionSchema = z.object({
  scheduledDate: dateStr,
  startTime:     timeStr,
  endTime:       timeStr,
  type:          sessionTypeSchema.default("extra"),
  subjectId:     z.string().uuid().optional(),
  facultyId:     z.string().uuid().optional(),
  room:          z.string().max(100).optional(),
  notes:         z.string().max(500).optional(),
});
export type CreateAdHocSessionInput = z.infer<typeof createAdHocSessionSchema>;

export const patchSessionSchema = z.object({
  status:        sessionStatusSchema.optional(),
  scheduledDate: dateStr.optional(),
  startTime:     timeStr.optional(),
  endTime:       timeStr.optional(),
  facultyId:     z.string().uuid().nullable().optional(),
  subjectId:     z.string().uuid().nullable().optional(),
  room:          z.string().max(100).nullable().optional(),
  cancelReason:  z.string().max(500).optional(),
  notes:         z.string().max(500).optional(),
});
export type PatchSessionInput = z.infer<typeof patchSessionSchema>;

export const sessionQuerySchema = z.object({
  from:   dateStr,
  to:     dateStr,
  status: sessionStatusSchema.optional(),
});
export type SessionQueryInput = z.infer<typeof sessionQuerySchema>;

// ── Attendance ───────────────────────────────────────────────────────────────

export const attendanceStatusSchema = z.enum(["present", "absent"]);
export type AttendanceStatusInput = z.infer<typeof attendanceStatusSchema>;

export const setAttendanceSchema = z.object({
  marks: z.array(z.object({
    studentId: z.string().uuid(),
    status:    attendanceStatusSchema,
  })),
});
export type SetAttendanceInput = z.infer<typeof setAttendanceSchema>;

export const setFacultyAttendanceSchema = z.object({
  date:  dateStr,
  marks: z.array(z.object({
    facultyId: z.string().uuid(),
    status:    attendanceStatusSchema,
  })),
});
export type SetFacultyAttendanceInput = z.infer<typeof setFacultyAttendanceSchema>;

// ── App releases (non-Play-Store APK updates) ───────────────────────────────

export const createAppReleaseSchema = z.object({
  tenantId:    z.string().uuid(),
  versionName: z.string().min(1),
  versionCode: z.number().int().positive(),
  s3Key:       z.string().min(1),
  changelog:   z.string().optional(),
});
export type CreateAppReleaseInput = z.infer<typeof createAppReleaseSchema>;

// ── CSR sponsorship ────────────────────────────────────────────────────────────
// A company sponsors one specific batch in full — see schema.prisma's
// SponsorshipContract comment for the full model. A sponsored batch is always
// fully sponsored (no mixing with self-paying students in the same batch).

export const createSponsorSchema = z.object({
  name:          z.string().min(1).max(200),
  contactPerson: z.string().max(120).optional(),
  phone:         z.string().max(20).optional(),
  email:         z.string().email().optional(),
  address:       z.string().max(500).optional(),
  gstin:         z.string().max(20).optional(),
  stateCode:     z.string().max(2).optional(),
  notes:         z.string().max(1000).optional(),
});
export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;

export const updateSponsorSchema = createSponsorSchema.partial();
export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;

export const createSponsorshipContractSchema = z.object({
  sponsorId:              z.string().uuid(),
  batchId:                z.string().uuid(),
  contractedStudentCount: z.number().int().positive(),
  totalContractAmount:    z.number().positive(),
  // null/omitted = GST-exempt for this contract's invoices.
  gstRate:                z.number().min(0).max(100).nullable().optional(),
  startDate:              z.coerce.date(),
  endDate:                z.coerce.date().nullable().optional(),
  notes:                  z.string().max(1000).optional(),
});
export type CreateSponsorshipContractInput = z.infer<typeof createSponsorshipContractSchema>;

export const updateSponsorshipContractSchema = z.object({
  contractedStudentCount: z.number().int().positive().optional(),
  totalContractAmount:    z.number().positive().optional(),
  gstRate:                z.number().min(0).max(100).nullable().optional(),
  startDate:              z.coerce.date().optional(),
  endDate:                z.coerce.date().nullable().optional(),
  status:                 z.enum(["active", "completed", "cancelled"]).optional(),
  notes:                  z.string().max(1000).optional(),
});
export type UpdateSponsorshipContractInput = z.infer<typeof updateSponsorshipContractSchema>;

export const createMilestoneSchema = z.object({
  label:   z.string().min(1).max(120),
  amount:  z.number().positive(),
  dueDate: z.coerce.date().nullable().optional(),
  notes:   z.string().max(500).optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const markMilestoneReceivedSchema = z.object({
  receivedAmount: z.number().positive(),
  receivedAt:     z.coerce.date().optional(),
});
export type MarkMilestoneReceivedInput = z.infer<typeof markMilestoneReceivedSchema>;
