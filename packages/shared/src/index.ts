import { z } from "zod";

export const staffRoleSchema = z.enum(["admin", "teacher", "frontdesk"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const examCategorySchema = z.enum(["ssc", "banking", "railway", "foundation"]);
export type ExamCategory = z.infer<typeof examCategorySchema>;

export const batchStatusSchema = z.enum(["upcoming", "running", "completed"]);
export const enrollmentStatusSchema = z.enum(["active", "paused", "completed", "dropped"]);
export const leadStatusSchema = z.enum(["new", "contacted", "visited", "converted", "lost"]);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(120),
  examCategory: examCategorySchema.nullable().optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  examCategory: examCategorySchema.nullable().optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const subjectQuerySchema = z.object({
  examCategory: examCategorySchema.optional(),
  search:       z.string().max(100).optional(),
});

export const createCourseSchema = z.object({
  name: z.string().min(1).max(120),
  examCategory: examCategorySchema,
  durationMonths: z.number().int().positive().max(60),
  defaultFee: z.number().nonnegative().max(10_000_000),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const courseQuerySchema = z.object({
  examCategory: examCategorySchema.optional(),
  search:       z.string().max(100).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

export const createBatchSchema = z.object({
  courseId:  z.string().uuid(),
  name:      z.string().min(1).max(120),
  capacity:  z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate:   z.coerce.date(),
});

export const updateBatchSchema = z.object({
  name:      z.string().min(1).max(120).optional(),
  capacity:  z.number().int().positive().optional(),
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
  status:    batchStatusSchema.optional(),
});

export const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  targetExam: examCategorySchema,
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
});
export type UpdateFacultyInput = z.infer<typeof updateFacultySchema>;

export const facultyQuerySchema = z.object({
  search:      z.string().max(100).optional(),
  examCategory: examCategorySchema.optional(),
  isActive:    z.coerce.boolean().optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
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
  dob:                z.coerce.date().nullable().optional(),
  address:            z.string().max(500).nullable().optional(),
  aadhaar:            z.string().max(20).nullable().optional(),
  gender:             z.enum(["male", "female"]).nullable().optional(),
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
  coursePreference:   z.enum(["ssc", "banking", "railway", "foundation", "others"]).nullable().optional(),
  durationPreference: z.enum(["3months", "6months", "1year"]).nullable().optional(),
  whatsapp:           z.string().max(20).nullable().optional(),
  // Office use
  batchId:            z.string().uuid().nullable().optional(),
  preferredTiming:    z.enum(["morning", "midday", "evening"]).nullable().optional(),
  paymentMode:        z.enum(["cash", "online"]).nullable().optional(),
  amountPaid:         z.number().nonnegative().nullable().optional(),
  // T&C acknowledgment — front desk confirms student was informed
  tcAcknowledged:     z.boolean().optional(),
  centerId:           z.string().uuid().optional(),
});
export type AdmitStudentInput = z.infer<typeof admitStudentSchema>;

export const updateStudentSchema = admitStudentSchema
  .omit({ batchId: true })
  .partial()
  .refine((d) => !d.fullName || d.fullName.length >= 1, { path: ["fullName"], message: "Name required" });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid(),
});

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
