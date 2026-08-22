-- CreateEnum
CREATE TYPE "GovOrgType" AS ENUM ('ssc', 'banking', 'railway', 'other');

-- CreateEnum
CREATE TYPE "GovRecruitmentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "GovContentSource" AS ENUM ('manual', 'scraped');

-- CreateEnum
CREATE TYPE "GovDocumentType" AS ENUM ('admit_card', 'result', 'answer_key', 'notification', 'syllabus');

-- CreateEnum
CREATE TYPE "GovCurrentAffairCategory" AS ENUM ('national', 'international', 'banking', 'economy', 'science', 'technology', 'defence', 'sports', 'awards', 'appointments', 'govt_schemes', 'environment');

-- CreateTable
CREATE TABLE "gov_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "type" "GovOrgType" NOT NULL,
    "logoUrl" TEXT,
    "officialWebsite" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov_recruitments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "totalVacancies" INTEGER,
    "qualification" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "categoryRelaxations" JSONB,
    "applicationFee" JSONB,
    "posts" JSONB,
    "applicationStartDate" TIMESTAMP(3),
    "applicationEndDate" TIMESTAMP(3),
    "examDate" TIMESTAMP(3),
    "officialNotificationUrl" TEXT,
    "officialWebsiteUrl" TEXT,
    "status" "GovRecruitmentStatus" NOT NULL DEFAULT 'draft',
    "source" "GovContentSource" NOT NULL DEFAULT 'manual',
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_recruitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov_documents" (
    "id" TEXT NOT NULL,
    "recruitmentId" TEXT NOT NULL,
    "type" "GovDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "source" "GovContentSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gov_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov_current_affairs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "GovCurrentAffairCategory" NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "keyFacts" JSONB,
    "whyImportant" TEXT,
    "examRelevance" JSONB,
    "publishedDate" TIMESTAMP(3) NOT NULL,
    "status" "GovRecruitmentStatus" NOT NULL DEFAULT 'draft',
    "source" "GovContentSource" NOT NULL DEFAULT 'manual',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_current_affairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gov_organizations_shortName_key" ON "gov_organizations"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "gov_recruitments_slug_key" ON "gov_recruitments"("slug");

-- CreateIndex
CREATE INDEX "gov_recruitments_status_organizationId_idx" ON "gov_recruitments"("status", "organizationId");

-- CreateIndex
CREATE INDEX "gov_recruitments_status_applicationEndDate_idx" ON "gov_recruitments"("status", "applicationEndDate");

-- CreateIndex
CREATE INDEX "gov_documents_recruitmentId_type_idx" ON "gov_documents"("recruitmentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "gov_current_affairs_slug_key" ON "gov_current_affairs"("slug");

-- CreateIndex
CREATE INDEX "gov_current_affairs_status_category_publishedDate_idx" ON "gov_current_affairs"("status", "category", "publishedDate");

-- AddForeignKey
ALTER TABLE "gov_recruitments" ADD CONSTRAINT "gov_recruitments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "gov_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov_documents" ADD CONSTRAINT "gov_documents_recruitmentId_fkey" FOREIGN KEY ("recruitmentId") REFERENCES "gov_recruitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
