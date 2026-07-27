-- Multi-tenancy: introduce Tenant as the top-level SaaS boundary above Center.
-- Every pre-existing row backfills into one "Default Institute" tenant so the
-- existing single-institute deployment keeps working unmodified after this runs.

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brandPrimary" TEXT,
    "brandSecondary" TEXT,
    "brandAccent" TEXT,
    "logoUrl" TEXT,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- Seed the default tenant every existing row will backfill into
INSERT INTO "tenants" ("id", "name", "slug")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Institute', 'default');

-- AlterTable: add tenantId as NULLABLE first so the backfill below can run
ALTER TABLE "centers" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "staff" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "subjects" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "faculty" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "courses" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "batches" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "students" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "document_types" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "exam_categories" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "leads" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN "tenantId" TEXT;

-- Backfill every existing row into the default tenant
UPDATE "centers" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "staff" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "subjects" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "faculty" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "courses" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "batches" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "students" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "document_types" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "exam_categories" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "leads" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "payment_transactions" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

-- Now that every row has a tenantId, enforce NOT NULL
ALTER TABLE "centers" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "staff" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "subjects" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "faculty" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "courses" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "batches" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "document_types" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "exam_categories" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "payment_transactions" ALTER COLUMN "tenantId" SET NOT NULL;

-- DropIndex: old globally-unique indexes, replaced by tenant-scoped compound ones below
DROP INDEX "document_types_key_key";
DROP INDEX "exam_categories_key_key";
DROP INDEX "faculty_email_key";
DROP INDEX "faculty_employeeCode_key";
DROP INDEX "faculty_phone_key";
DROP INDEX "payment_transactions_receiptNo_key";
DROP INDEX "students_studentCode_key";
DROP INDEX "subjects_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "document_types_tenantId_key_key" ON "document_types"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "exam_categories_tenantId_key_key" ON "exam_categories"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_tenantId_employeeCode_key" ON "faculty"("tenantId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_tenantId_phone_key" ON "faculty"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_tenantId_email_key" ON "faculty"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_tenantId_receiptNo_key" ON "payment_transactions"("tenantId", "receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_studentCode_key" ON "students"("tenantId", "studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenantId_name_key" ON "subjects"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "centers" ADD CONSTRAINT "centers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_categories" ADD CONSTRAINT "exam_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
