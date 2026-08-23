-- CreateEnum
CREATE TYPE "GovSourceContentType" AS ENUM ('recruitment', 'current_affair');

-- CreateTable
CREATE TABLE "gov_sources" (
    "id" TEXT NOT NULL,
    "category" "GovOrgType" NOT NULL,
    "contentType" "GovSourceContentType" NOT NULL,
    "organizationId" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapedAt" TIMESTAMP(3),
    "lastScrapeStatus" TEXT,
    "lastScrapeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gov_sources_category_enabled_idx" ON "gov_sources"("category", "enabled");

-- AddForeignKey
ALTER TABLE "gov_sources" ADD CONSTRAINT "gov_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "gov_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
