-- ============================================================================
-- Migration: batch_tracking_and_transfers
--
-- Adds FEFO batch tracking, branch-to-branch Transfer Orders, conditional
-- product expiry config, and branch cash float to an EXISTING populated DB.
--
-- Safe to run on production: all additions are nullable / defaulted, and the
-- inventory unique-key swap preserves existing rows (they keep batchId = NULL).
-- Naming matches Prisma's conventions so a later `prisma migrate` stays in sync.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) New enums
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ExpiryTrackingType" AS ENUM ('SHELF_LIFE_DAYS', 'MANUFACTURE_TO_EXPIRY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2) Branch cash float (Requirement #2)
-- ----------------------------------------------------------------------------
ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "cashFloat" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3) Product expiry configuration (Requirement #3)
-- ----------------------------------------------------------------------------
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "tracksExpiry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expiryTrackingType" "ExpiryTrackingType";

-- Back-fill: products that already had a shelfLifeDays value are expiry-tracked.
UPDATE "products"
  SET "tracksExpiry" = true, "expiryTrackingType" = 'SHELF_LIFE_DAYS'
  WHERE "shelfLifeDays" IS NOT NULL AND "shelfLifeDays" > 0 AND "tracksExpiry" = false;

-- ----------------------------------------------------------------------------
-- 4) Batch table (FEFO) — Requirement #4
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "batches" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAtBranchId" INTEGER,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "batches_batchNumber_key" ON "batches"("batchNumber");
CREATE INDEX IF NOT EXISTS "batches_productId_expiryDate_idx" ON "batches"("productId", "expiryDate");

DO $$ BEGIN
  ALTER TABLE "batches" ADD CONSTRAINT "batches_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 5) Inventory: add batch link + per-row batch attributes, then swap the
--    unique key to include the batch
-- ----------------------------------------------------------------------------
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "batchId" INTEGER;

-- Per-row batch attributes mirrored from the originating Batch so a single
-- stock row can carry its own manufacture/expiry/batch-number. These match the
-- Prisma `Inventory` model; without them `prisma.inventory.findMany()` and PO
-- receipt (which writes manufactureDate) fail with "column does not exist".
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "manufactureDate" TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "batchNumber" TEXT;

-- Drop the old (productId, branchId) unique so multiple batches can coexist.
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_productId_branchId_key";
DROP INDEX IF EXISTS "inventory_productId_branchId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_productId_branchId_batchId_key"
  ON "inventory"("productId", "branchId", "batchId");
CREATE INDEX IF NOT EXISTS "inventory_productId_branchId_idx" ON "inventory"("productId", "branchId");
CREATE INDEX IF NOT EXISTS "inventory_expiryDate_idx" ON "inventory"("expiryDate");

DO $$ BEGIN
  ALTER TABLE "inventory" ADD CONSTRAINT "inventory_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 6) Transfer Orders (Requirement #5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "transfer_orders" (
    "id" SERIAL NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromBranchId" INTEGER NOT NULL,
    "toBranchId" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" INTEGER,
    "receivedById" INTEGER,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transfer_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_orders_transferNo_key" ON "transfer_orders"("transferNo");
CREATE INDEX IF NOT EXISTS "transfer_orders_fromBranchId_status_idx" ON "transfer_orders"("fromBranchId", "status");
CREATE INDEX IF NOT EXISTS "transfer_orders_toBranchId_status_idx" ON "transfer_orders"("toBranchId", "status");
CREATE INDEX IF NOT EXISTS "transfer_orders_status_idx" ON "transfer_orders"("status");

CREATE TABLE IF NOT EXISTS "transfer_order_items" (
    "id" SERIAL NOT NULL,
    "transferOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "quantity" DOUBLE PRECISION NOT NULL,
    "expiryDate" TIMESTAMP(3),
    CONSTRAINT "transfer_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "transfer_order_items_transferOrderId_idx" ON "transfer_order_items"("transferOrderId");
CREATE INDEX IF NOT EXISTS "transfer_order_items_productId_idx" ON "transfer_order_items"("productId");

DO $$ BEGIN
  ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_fromBranchId_fkey"
    FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_toBranchId_fkey"
    FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_order_items" ADD CONSTRAINT "transfer_order_items_transferOrderId_fkey"
    FOREIGN KEY ("transferOrderId") REFERENCES "transfer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_order_items" ADD CONSTRAINT "transfer_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_order_items" ADD CONSTRAINT "transfer_order_items_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
