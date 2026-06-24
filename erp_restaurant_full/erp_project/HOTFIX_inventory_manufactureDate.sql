-- ============================================================================
-- HOTFIX: inventory.manufactureDate (and sibling batch columns) missing
--
-- Apply this directly to the live database to immediately resolve the
-- "column inventory.manufactureDate does not exist" 500 errors affecting:
--   - GET /api/inventory, /api/inventory/low-stock, /api/inventory/expiry-alerts
--   - GET /api/reports/financials
--   - GET /api/transfers/fefo-preview,  POST /api/transfers
--   - PATCH /api/purchase-orders/:id/receive   (PO receiving)
--   - the expiry Scheduler job
--
-- Idempotent: safe to run more than once.
--
--   psql "$DATABASE_URL" -f HOTFIX_inventory_manufactureDate.sql
-- ============================================================================

ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "manufactureDate" TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "expiryDate"      TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "batchNumber"     TEXT;

CREATE INDEX IF NOT EXISTS "inventory_expiryDate_idx" ON "inventory"("expiryDate");
