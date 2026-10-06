CREATE TYPE "StaffRole" AS ENUM ('FULL_ADMINISTRATOR', 'BILLING_OPERATOR', 'SUPPORT_OPERATOR');

-- Preserve existing administrators. New staff creation always supplies its role.
ALTER TABLE "admin_profiles"
  ADD COLUMN "staff_role" "StaffRole" NOT NULL DEFAULT 'FULL_ADMINISTRATOR';
