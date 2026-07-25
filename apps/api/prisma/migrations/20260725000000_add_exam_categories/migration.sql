-- CreateTable
CREATE TABLE "exam_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B1E3F',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exam_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_categories_key_key" ON "exam_categories"("key");

-- Seed the 4 known categories — needed synchronously so the backfill below has
-- rows to join against. Kept in sync with apps/api/prisma/seedExamCategories.ts,
-- which is the mechanism for adding further categories after this migration.
INSERT INTO "exam_categories" ("id", "key", "label", "color", "sortOrder") VALUES
    (gen_random_uuid(), 'ssc',        'SSC',        '#8B1E3F', 1),
    (gen_random_uuid(), 'banking',    'Banking',    '#2563A8', 2),
    (gen_random_uuid(), 'railway',    'Railway',    '#2CA6A4', 3),
    (gen_random_uuid(), 'foundation', 'Foundation', '#5B2D8E', 4);

-- AlterTable: add new FK columns (nullable for now — populated by the backfill
-- below before any NOT NULL constraint is applied)
ALTER TABLE "courses"  ADD COLUMN "examCategoryId" TEXT;
ALTER TABLE "subjects" ADD COLUMN "examCategoryId" TEXT;
ALTER TABLE "leads"    ADD COLUMN "targetExamId"   TEXT;

-- Backfill from the old enum columns to the new FK columns
UPDATE "courses" c
SET "examCategoryId" = ec."id"
FROM "exam_categories" ec
WHERE ec."key" = c."examCategory"::text;

UPDATE "subjects" s
SET "examCategoryId" = ec."id"
FROM "exam_categories" ec
WHERE ec."key" = s."examCategory"::text
  AND s."examCategory" IS NOT NULL;

UPDATE "leads" l
SET "targetExamId" = ec."id"
FROM "exam_categories" ec
WHERE ec."key" = l."targetExam"::text;

-- leads.targetExam was NOT NULL, so every row is now backfilled — safe to enforce
ALTER TABLE "leads" ALTER COLUMN "targetExamId" SET NOT NULL;

-- Drop the old enum columns and the enum type itself
ALTER TABLE "courses"  DROP COLUMN "examCategory";
ALTER TABLE "subjects" DROP COLUMN "examCategory";
ALTER TABLE "leads"    DROP COLUMN "targetExam";
DROP TYPE "ExamCategory";

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "exam_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "exam_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_targetExamId_fkey" FOREIGN KEY ("targetExamId") REFERENCES "exam_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
