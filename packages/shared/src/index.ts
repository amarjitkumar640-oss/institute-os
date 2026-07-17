import { z } from "zod";

export const staffRoleSchema = z.enum(["admin", "teacher", "frontdesk"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const examCategorySchema = z.enum(["ssc", "banking", "railway"]);
export type ExamCategory = z.infer<typeof examCategorySchema>;

export const batchStatusSchema = z.enum(["upcoming", "running", "completed"]);
export const enrollmentStatusSchema = z.enum(["active", "paused", "completed", "dropped"]);
export const leadStatusSchema = z.enum(["new", "contacted", "visited", "converted", "lost"]);
export const feePlanTypeSchema = z.enum(["full", "installment"]);
export const feePaymentStatusSchema = z.enum(["pending", "paid", "overdue"]);

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
});

export const convertLeadSchema = z.object({
  batchId: z.string().uuid(),
  feePlan: z.object({
    totalAmount: z.number().nonnegative(),
    planType: feePlanTypeSchema,
  }),
  studentDob: z.coerce.date().optional(),
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
