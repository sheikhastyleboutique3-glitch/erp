-- Restaurant ERP — staff approval onboarding gate. Additive + safe.
-- New users default to PENDING (false); approve ALL existing users so nobody
-- currently in the system is locked out.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "isApproved" = true;
