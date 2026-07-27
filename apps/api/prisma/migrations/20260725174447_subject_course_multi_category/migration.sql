-- Subjects and Courses can now belong to zero-or-more exam categories instead
-- of exactly one (or null = shared/general). Existing single-category values
-- backfill into the new join tables before the old columns are dropped.

-- CreateTable
CREATE TABLE "subject_exam_categories" (
    "subjectId" TEXT NOT NULL,
    "examCategoryId" TEXT NOT NULL,

    CONSTRAINT "subject_exam_categories_pkey" PRIMARY KEY ("subjectId","examCategoryId")
);

-- CreateTable
CREATE TABLE "course_exam_categories" (
    "courseId" TEXT NOT NULL,
    "examCategoryId" TEXT NOT NULL,

    CONSTRAINT "course_exam_categories_pkey" PRIMARY KEY ("courseId","examCategoryId")
);

-- AddForeignKey
ALTER TABLE "subject_exam_categories" ADD CONSTRAINT "subject_exam_categories_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_exam_categories" ADD CONSTRAINT "subject_exam_categories_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "exam_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_exam_categories" ADD CONSTRAINT "course_exam_categories_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_exam_categories" ADD CONSTRAINT "course_exam_categories_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "exam_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one join-table row per existing single-category assignment
INSERT INTO "subject_exam_categories" ("subjectId", "examCategoryId")
SELECT "id", "examCategoryId" FROM "subjects" WHERE "examCategoryId" IS NOT NULL;

INSERT INTO "course_exam_categories" ("courseId", "examCategoryId")
SELECT "id", "examCategoryId" FROM "courses" WHERE "examCategoryId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_examCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_examCategoryId_fkey";

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "examCategoryId";

-- AlterTable
ALTER TABLE "subjects" DROP COLUMN "examCategoryId";

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenantId_name_key" ON "courses"("tenantId", "name");
