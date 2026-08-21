-- CreateEnum
CREATE TYPE "StaffLoginMethod" AS ENUM ('phone', 'email_username');

-- AlterTable: tenants gain an admin-configurable login method
ALTER TABLE "tenants" ADD COLUMN "loginMethod" "StaffLoginMethod" NOT NULL DEFAULT 'email_username';

-- AlterTable: staff gain an optional username
ALTER TABLE "staff" ADD COLUMN "username" TEXT;

-- Revert Staff.phone from globally-unique back to tenant-scoped uniqueness.
-- Tenant is now known from the app build itself, so a bare identifier no
-- longer needs to resolve to a tenant on its own — matches the existing
-- Faculty.phone / Faculty.email tenant-scoped pattern.
DROP INDEX IF EXISTS "staff_phone_key";

CREATE UNIQUE INDEX "staff_tenantId_phone_key" ON "staff"("tenantId", "phone");
CREATE UNIQUE INDEX "staff_tenantId_username_key" ON "staff"("tenantId", "username");
