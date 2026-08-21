-- CreateTable
CREATE TABLE "permission_grants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "screenKey" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permission_grants_tenantId_role_screenKey_key" ON "permission_grants"("tenantId", "role", "screenKey");

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
