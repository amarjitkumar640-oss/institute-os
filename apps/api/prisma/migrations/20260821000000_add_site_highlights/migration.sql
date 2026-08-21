-- CreateEnum
CREATE TYPE "SiteContentType" AS ENUM ('announcement', 'result', 'gallery');

-- CreateTable
CREATE TABLE "site_highlights" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "SiteContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "meta" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_highlights_tenantId_type_isActive_publishedAt_idx" ON "site_highlights"("tenantId", "type", "isActive", "publishedAt");

-- AddForeignKey
ALTER TABLE "site_highlights" ADD CONSTRAINT "site_highlights_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
