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
  name: z.string().min(1),
  examCategory: examCategorySchema.nullable().optional(),
});

export const createCourseSchema = z.object({
  name: z.string().min(1),
  examCategory: examCategorySchema,
  durationMonths: z.number().int().positive(),
  defaultFee: z.number().nonnegative(),
});

export const createBatchSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
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

export const createStudentSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable().optional(),
  dob: z.coerce.date().nullable().optional(),
  address: z.string().nullable().optional(),
  guardianPhone: z.string().nullable().optional(),
});

export const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  batchId: z.string().uuid(),
});
