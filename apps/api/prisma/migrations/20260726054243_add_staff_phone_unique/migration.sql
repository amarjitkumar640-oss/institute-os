-- AlterTable: enforce global uniqueness on Staff.phone, mirroring the
-- existing global uniqueness on Staff.email, so a login identifier
-- (email or phone) always resolves to exactly one tenant.
CREATE UNIQUE INDEX "staff_phone_key" ON "staff"("phone");
