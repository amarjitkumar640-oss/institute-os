-- DropForeignKey (old fee tables)
ALTER TABLE "fee_payments" DROP CONSTRAINT IF EXISTS "fee_payments_feePlanId_fkey";
ALTER TABLE "fee_plans"    DROP CONSTRAINT IF EXISTS "fee_plans_enrollmentId_fkey";

-- DropTable
DROP TABLE IF EXISTS "fee_payments";
DROP TABLE IF EXISTS "fee_plans";

-- DropEnum
DROP TYPE IF EXISTS "FeePlanType";
DROP TYPE IF EXISTS "FeePaymentStatus";

-- CreateEnum
CREATE TYPE "TemplateLineType" AS ENUM ('fixed', 'percentage', 'equal_split', 'remaining');
CREATE TYPE "TemplateTrigger"  AS ENUM ('on_admission', 'days_after_admission', 'days_after_previous', 'monthly_recurring');
CREATE TYPE "FeeScheduleStatus" AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE "InstallmentStatus" AS ENUM ('pending', 'partial', 'paid', 'overdue', 'waived', 'deferred');
CREATE TYPE "TxnMode" AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'cheque');
CREATE TYPE "TxnType" AS ENUM ('payment', 'refund', 'adjustment', 'credit_applied');

-- CreateTable: course_fee_templates
CREATE TABLE "course_fee_templates" (
    "id"        TEXT NOT NULL,
    "courseId"  TEXT NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "course_fee_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_fee_templates_courseId_key" ON "course_fee_templates"("courseId");

-- CreateTable: template_lines
CREATE TABLE "template_lines" (
    "id"         TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sortOrder"  INTEGER NOT NULL,
    "label"      TEXT NOT NULL,
    "lineType"   "TemplateLineType" NOT NULL DEFAULT 'fixed',
    "amount"     DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "splitCount" INTEGER,
    "trigger"    "TemplateTrigger" NOT NULL DEFAULT 'on_admission',
    "offsetDays" INTEGER,
    "dayOfMonth" INTEGER,
    CONSTRAINT "template_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: student_fee_schedules
CREATE TABLE "student_fee_schedules" (
    "id"             TEXT NOT NULL,
    "enrollmentId"   TEXT NOT NULL,
    "totalFee"       DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "effectiveFee"   DECIMAL(10,2) NOT NULL,
    "creditBalance"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status"         "FeeScheduleStatus" NOT NULL DEFAULT 'active',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_fee_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_fee_schedules_enrollmentId_key" ON "student_fee_schedules"("enrollmentId");

-- CreateTable: schedule_installments
CREATE TABLE "schedule_installments" (
    "id"            TEXT NOT NULL,
    "scheduleId"    TEXT NOT NULL,
    "sortOrder"     INTEGER NOT NULL,
    "label"         TEXT NOT NULL,
    "plannedAmount" DECIMAL(10,2) NOT NULL,
    "paidAmount"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waivedAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lateFee"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dueDate"       DATE NOT NULL,
    "status"        "InstallmentStatus" NOT NULL DEFAULT 'pending',
    "waivedReason"  TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "schedule_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_transactions
CREATE TABLE "payment_transactions" (
    "id"            TEXT NOT NULL,
    "scheduleId"    TEXT NOT NULL,
    "installmentId" TEXT,
    "amount"        DECIMAL(10,2) NOT NULL,
    "mode"          "TxnMode" NOT NULL,
    "type"          "TxnType" NOT NULL DEFAULT 'payment',
    "receiptNo"     TEXT,
    "paidAt"        TIMESTAMP(3) NOT NULL,
    "collectedById" TEXT,
    "chequeNo"      TEXT,
    "bankName"      TEXT,
    "upiRef"        TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_transactions_receiptNo_key" ON "payment_transactions"("receiptNo");

-- AddForeignKey
ALTER TABLE "course_fee_templates"  ADD CONSTRAINT "course_fee_templates_courseId_fkey"          FOREIGN KEY ("courseId")       REFERENCES "courses"("id")                ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "template_lines"         ADD CONSTRAINT "template_lines_templateId_fkey"               FOREIGN KEY ("templateId")     REFERENCES "course_fee_templates"("id")   ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE "student_fee_schedules"  ADD CONSTRAINT "student_fee_schedules_enrollmentId_fkey"      FOREIGN KEY ("enrollmentId")   REFERENCES "enrollments"("id")            ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "schedule_installments"  ADD CONSTRAINT "schedule_installments_scheduleId_fkey"        FOREIGN KEY ("scheduleId")     REFERENCES "student_fee_schedules"("id")  ON DELETE CASCADE   ON UPDATE CASCADE;
ALTER TABLE "payment_transactions"   ADD CONSTRAINT "payment_transactions_scheduleId_fkey"         FOREIGN KEY ("scheduleId")     REFERENCES "student_fee_schedules"("id")  ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "payment_transactions"   ADD CONSTRAINT "payment_transactions_installmentId_fkey"      FOREIGN KEY ("installmentId")  REFERENCES "schedule_installments"("id")  ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "payment_transactions"   ADD CONSTRAINT "payment_transactions_collectedById_fkey"      FOREIGN KEY ("collectedById")  REFERENCES "staff"("id")                  ON DELETE SET NULL  ON UPDATE CASCADE;
