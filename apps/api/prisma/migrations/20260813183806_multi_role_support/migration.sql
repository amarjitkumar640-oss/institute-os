-- Multi-role support: a staff member can hold more than one role at the
-- same center at once. Replaces the single `role` column on `center_staff`
-- and `staff` with a `roles` array column, preserving existing data
-- (each existing single role becomes a one-element array).

-- center_staff
ALTER TABLE "center_staff" ADD COLUMN "roles" "StaffRole"[] NOT NULL DEFAULT '{}';
UPDATE "center_staff" SET "roles" = ARRAY["role"]::"StaffRole"[];
ALTER TABLE "center_staff" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "center_staff" DROP COLUMN "role";

-- staff
ALTER TABLE "staff" ADD COLUMN "roles" "StaffRole"[] NOT NULL DEFAULT '{}';
UPDATE "staff" SET "roles" = ARRAY["role"]::"StaffRole"[];
ALTER TABLE "staff" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "staff" DROP COLUMN "role";
