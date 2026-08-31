-- AlterTable: add the new columns nullable first so existing rows can be
-- backfilled from gov_organizations before category becomes NOT NULL and
-- the organization relation is dropped.
ALTER TABLE "gov_recruitments" ADD COLUMN "category" "GovOrgType",
ADD COLUMN     "organization" TEXT;

-- Backfill category/organization from the linked organization before it's
-- dropped, so existing recruitment data keeps its category and a display
-- name instead of being silently lost.
UPDATE "gov_recruitments" r
SET "category" = go."type",
    "organization" = go."name"
FROM "gov_organizations" go
WHERE go."id" = r."organizationId";

ALTER TABLE "gov_recruitments" ALTER COLUMN "category" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "gov_recruitments" DROP CONSTRAINT "gov_recruitments_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "gov_sources" DROP CONSTRAINT "gov_sources_organizationId_fkey";

-- DropIndex
DROP INDEX "gov_recruitments_status_organizationId_idx";

-- AlterTable
ALTER TABLE "gov_recruitments" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "gov_sources" DROP COLUMN "organizationId";

-- DropTable
DROP TABLE "gov_organizations";

-- CreateIndex
CREATE INDEX "gov_recruitments_status_category_idx" ON "gov_recruitments"("status", "category");
