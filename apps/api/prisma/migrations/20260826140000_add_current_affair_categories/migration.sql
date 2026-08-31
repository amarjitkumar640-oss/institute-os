-- CreateEnum
CREATE TYPE "CurrentAffairCategoryPriority" AS ENUM ('primary', 'secondary');

-- CreateTable
CREATE TABLE "current_affair_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelHi" TEXT NOT NULL,
    "shortLabelEn" TEXT NOT NULL,
    "shortLabelHi" TEXT NOT NULL,
    "priority" "CurrentAffairCategoryPriority" NOT NULL DEFAULT 'primary',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_affair_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "current_affair_categories_key_key" ON "current_affair_categories"("key");

-- Seed the 15 target categories (order 1 = "All" is a frontend-only pseudo-tab,
-- not a row here — sortOrder starts at 2 to leave that slot). "banking" and
-- "govt_schemes" are renamed in place (banking-finance / government-schemes);
-- "science" and "technology" merge into one "science-technology" row.
-- Hindi labels for the 12 legacy categories are the real strings that were
-- already in apps/exam-portal/src/i18n/index.tsx before this migration.
-- The 3 new categories (important-days, reports-indices, books-authors) have
-- no prior translation — seeded with the English string in both languages
-- as a placeholder; admin can fix via the new Categories tab.
-- "national" keeps isDefault = true, matching the scraper's old hardcoded
-- 'national' fallback (see scrape-validator.ts).
INSERT INTO "current_affair_categories"
  ("id", "key", "labelEn", "labelHi", "shortLabelEn", "shortLabelHi", "priority", "sortOrder", "isVisible", "isDefault", "updatedAt")
VALUES
  (gen_random_uuid(), 'national',           'National',              'राष्ट्रीय',          'National',           'National',          'primary',   2,  true, true,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'international',      'International',         'अंतरराष्ट्रीय',      'International',      'International',     'primary',   3,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'banking-finance',    'Banking & Finance',      'बैंकिंग',            'Banking & Finance',  'Banking & Finance', 'primary',   4,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'economy',            'Economy',                'अर्थव्यवस्था',       'Economy',            'Economy',           'primary',   5,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'government-schemes', 'Government Schemes',     'सरकारी योजनाएं',     'Govt. Schemes',      'Govt. Schemes',     'primary',   6,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'sports',             'Sports',                 'खेल',                'Sports',             'Sports',            'primary',   7,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'defence',            'Defence',                'रक्षा',              'Defence',            'Defence',           'primary',   8,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'science-technology', 'Science & Technology',   'विज्ञान',            'Science & Tech',     'Science & Tech',    'primary',   9,  true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'awards',             'Awards',                 'पुरस्कार',           'Awards',             'Awards',            'secondary', 10, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'appointments',       'Appointments',           'नियुक्तियां',        'Appointments',       'Appointments',      'secondary', 11, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'environment',        'Environment',            'पर्यावरण',           'Environment',        'Environment',       'secondary', 12, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'important-days',     'Important Days',         'Important Days',     'Important Days',     'Important Days',    'secondary', 13, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'reports-indices',    'Reports & Indices',      'Reports & Indices',  'Reports & Indices',  'Reports & Indices', 'secondary', 14, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'books-authors',      'Books & Authors',        'Books & Authors',    'Books & Authors',    'Books & Authors',   'secondary', 15, true, false, CURRENT_TIMESTAMP);

-- AlterTable: add new FK column (nullable for now — populated by the backfill
-- below before any NOT NULL constraint is applied)
ALTER TABLE "gov_current_affairs" ADD COLUMN "categoryId" TEXT;

-- Backfill from the old enum column to the new FK column. Direct key match
-- for 8 unchanged categories; banking/govt_schemes map onto their renamed
-- rows; both science and technology collapse onto the merged row.
UPDATE "gov_current_affairs" ca
SET "categoryId" = cac."id"
FROM "current_affair_categories" cac
WHERE
  (ca."category"::text = 'banking' AND cac."key" = 'banking-finance') OR
  (ca."category"::text = 'govt_schemes' AND cac."key" = 'government-schemes') OR
  (ca."category"::text IN ('science', 'technology') AND cac."key" = 'science-technology') OR
  (ca."category"::text = cac."key");

-- gov_current_affairs.category was NOT NULL, so every row is now
-- backfilled — safe to enforce.
ALTER TABLE "gov_current_affairs" ALTER COLUMN "categoryId" SET NOT NULL;

-- Drop the old enum column and index that referenced it
DROP INDEX "gov_current_affairs_status_category_publishedDate_idx";
ALTER TABLE "gov_current_affairs" DROP COLUMN "category";
DROP TYPE "GovCurrentAffairCategory";

-- CreateIndex (recreated against the new FK column)
CREATE INDEX "gov_current_affairs_status_categoryId_publishedDate_idx" ON "gov_current_affairs"("status", "categoryId", "publishedDate");

-- AddForeignKey
ALTER TABLE "gov_current_affairs" ADD CONSTRAINT "gov_current_affairs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "current_affair_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
