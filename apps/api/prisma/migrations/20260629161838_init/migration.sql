-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'teacher', 'frontdesk');

-- CreateEnum
CREATE TYPE "ExamCategory" AS ENUM ('ssc', 'banking', 'railway');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('upcoming', 'running', 'completed');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'paused', 'completed', 'dropped');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'visited', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "FeePlanType" AS ENUM ('full', 'installment');

-- CreateEnum
CREATE TYPE "FeePaymentStatus" AS ENUM ('pending', 'paid', 'overdue');

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "ExamCategory",

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "ExamCategory" NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "defaultFee" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'upcoming',

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "photoUrl" TEXT,
    "dob" TIMESTAMP(3),
    "address" TEXT,
    "guardianPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "enrolledOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "targetExam" "ExamCategory" NOT NULL,
    "source" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "assignedToId" TEXT,
    "convertedStudentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_plans" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "planType" "FeePlanType" NOT NULL,

    CONSTRAINT "fee_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL,
    "feePlanId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidOn" TIMESTAMP(3),
    "status" "FeePaymentStatus" NOT NULL DEFAULT 'pending',
    "receiptNo" TEXT,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_studentCode_key" ON "students"("studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_studentId_batchId_key" ON "enrollments"("studentId", "batchId");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "fee_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
