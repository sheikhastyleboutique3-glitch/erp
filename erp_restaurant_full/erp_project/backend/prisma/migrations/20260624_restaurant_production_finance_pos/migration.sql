-- Restaurant ERP — Increments 2-6: Production, Finance, Tables/Reservations, Promotions, KDS
-- Additive migration. Reversible by dropping the new tables/columns/types.

-- 1) New enums -------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE "KdsStatus" AS ENUM ('QUEUED','PREPARING','READY','SERVED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ProductionOrderStatus" AS ENUM ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FinanceEntryType" AS ENUM ('SALE_REVENUE','COGS','TAX','SERVICE_CHARGE','TIP','PURCHASE','WASTAGE','PRODUCTION_COST','REFUND','PAYMENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ReservationStatus" AS ENUM ('BOOKED','SEATED','CANCELLED','NO_SHOW','COMPLETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE','OCCUPIED','RESERVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CouponType" AS ENUM ('PERCENT','FIXED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Order / OrderItem additive columns -----------------------------------------
ALTER TABLE "orders"      ADD COLUMN IF NOT EXISTS "tableId"   INTEGER;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "kdsStatus" "KdsStatus" NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "firedAt"   TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "readyAt"   TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "order_items_kdsStatus_idx" ON "order_items"("kdsStatus");

-- 3) Production orders -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "production_orders" (
  "id"           SERIAL PRIMARY KEY,
  "productionNo" TEXT NOT NULL,
  "branchId"     INTEGER NOT NULL,
  "productId"    INTEGER NOT NULL,
  "recipeId"     INTEGER,
  "plannedQty"   DOUBLE PRECISION NOT NULL,
  "producedQty"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"       "ProductionOrderStatus" NOT NULL DEFAULT 'PLANNED',
  "batchNumber"  TEXT,
  "expiryDate"   TIMESTAMP(3),
  "totalCost"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"        TEXT,
  "createdById"  INTEGER,
  "startedAt"    TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "production_orders_productionNo_key" ON "production_orders"("productionNo");
CREATE INDEX IF NOT EXISTS "production_orders_branchId_status_idx" ON "production_orders"("branchId","status");
CREATE INDEX IF NOT EXISTS "production_orders_productId_idx" ON "production_orders"("productId");

CREATE TABLE IF NOT EXISTS "production_consumptions" (
  "id"                 SERIAL PRIMARY KEY,
  "productionOrderId"  INTEGER NOT NULL,
  "componentProductId" INTEGER NOT NULL,
  "plannedQty"         DOUBLE PRECISION NOT NULL,
  "actualQty"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitCost"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineCost"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "production_consumptions_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "production_consumptions_productionOrderId_idx" ON "production_consumptions"("productionOrderId");

-- 4) Finance journal -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "finance_entries" (
  "id"          SERIAL PRIMARY KEY,
  "type"        "FinanceEntryType" NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'QAR',
  "branchId"    INTEGER,
  "sourceType"  TEXT,
  "sourceId"    INTEGER,
  "reference"   TEXT,
  "notes"       TEXT,
  "createdById" INTEGER,
  "occurredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "finance_entries_type_idx" ON "finance_entries"("type");
CREATE INDEX IF NOT EXISTS "finance_entries_branchId_occurredAt_idx" ON "finance_entries"("branchId","occurredAt");
CREATE INDEX IF NOT EXISTS "finance_entries_sourceType_sourceId_idx" ON "finance_entries"("sourceType","sourceId");

-- 5) Tables & reservations -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "restaurant_tables" (
  "id"        SERIAL PRIMARY KEY,
  "branchId"  INTEGER NOT NULL,
  "name"      TEXT NOT NULL,
  "seats"     INTEGER NOT NULL DEFAULT 2,
  "status"    "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "restaurant_tables_branchId_status_idx" ON "restaurant_tables"("branchId","status");

CREATE TABLE IF NOT EXISTS "reservations" (
  "id"           SERIAL PRIMARY KEY,
  "branchId"     INTEGER NOT NULL,
  "tableId"      INTEGER,
  "customerId"   INTEGER,
  "customerName" TEXT,
  "phone"        TEXT,
  "partySize"    INTEGER NOT NULL DEFAULT 2,
  "reservedAt"   TIMESTAMP(3) NOT NULL,
  "status"       "ReservationStatus" NOT NULL DEFAULT 'BOOKED',
  "notes"        TEXT,
  "createdById"  INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "reservations_branchId_reservedAt_idx" ON "reservations"("branchId","reservedAt");
CREATE INDEX IF NOT EXISTS "reservations_status_idx" ON "reservations"("status");

-- 6) Promotions: gift cards & coupons -------------------------------------------
CREATE TABLE IF NOT EXISTS "gift_cards" (
  "id"             SERIAL PRIMARY KEY,
  "code"           TEXT NOT NULL,
  "initialBalance" DOUBLE PRECISION NOT NULL,
  "balance"        DOUBLE PRECISION NOT NULL,
  "customerId"     INTEGER,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "gift_cards_code_key" ON "gift_cards"("code");

CREATE TABLE IF NOT EXISTS "coupons" (
  "id"             SERIAL PRIMARY KEY,
  "code"           TEXT NOT NULL,
  "type"           "CouponType" NOT NULL,
  "value"          DOUBLE PRECISION NOT NULL,
  "minOrder"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxRedemptions" INTEGER,
  "redeemedCount"  INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "startsAt"       TIMESTAMP(3),
  "endsAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");
