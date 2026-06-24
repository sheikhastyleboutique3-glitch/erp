-- Restaurant ERP — Qatar compliance fields on branches (additive).
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "crNumber"          TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "baladiyaLicenseNo" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "licenseExpiryDate" TIMESTAMP(3);
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "isEnforcedLocked"  BOOLEAN NOT NULL DEFAULT false;
