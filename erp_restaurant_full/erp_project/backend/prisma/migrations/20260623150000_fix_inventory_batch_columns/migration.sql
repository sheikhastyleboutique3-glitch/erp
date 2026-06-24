-- ============================================================================
-- Migration: fix_inventory_batch_columns
--
-- Hotfix for an EXISTING DB where the batch_tracking_and_transfers migration
-- added "inventory"."batchId" but NOT the per-row batch attributes declared on
-- the Prisma `Inventory` model. The absence of "manufactureDate" causes every
-- prisma.inventory.findMany() (inventory list, financial reports, expiry
-- scheduler) AND purchase-order receipt (inventory.applyAdjustment writes
-- manufactureDate) to fail with:
--   "The column inventory.manufactureDate does not exist in the current database."
--
-- All statements are idempotent (IF NOT EXISTS), so this is safe to run on any
-- DB state, including one that already received these columns.
-- ============================================================================

ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "manufactureDate" TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "expiryDate"      TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "batchNumber"     TEXT;

-- Index used by the expiry-alert queries (no-op if it already exists).
CREATE INDEX IF NOT EXISTS "inventory_expiryDate_idx" ON "inventory"("expiryDate");
