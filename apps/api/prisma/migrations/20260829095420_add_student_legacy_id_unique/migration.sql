-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_legacyId_key" ON "students"("tenantId", "legacyId");
