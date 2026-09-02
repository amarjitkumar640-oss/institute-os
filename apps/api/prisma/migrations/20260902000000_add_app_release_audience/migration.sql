-- DropIndex
DROP INDEX "app_releases_tenantId_platform_isActive_versionCode_idx";

-- AlterTable
ALTER TABLE "app_releases" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'staff';

-- CreateIndex
CREATE INDEX "app_releases_tenantId_platform_audience_isActive_versionCod_idx" ON "app_releases"("tenantId", "platform", "audience", "isActive", "versionCode");
