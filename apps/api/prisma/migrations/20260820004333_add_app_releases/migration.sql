-- CreateTable
CREATE TABLE "app_releases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "versionName" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "changelog" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_releases_tenantId_platform_isActive_versionCode_idx" ON "app_releases"("tenantId", "platform", "isActive", "versionCode");

-- AddForeignKey
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
