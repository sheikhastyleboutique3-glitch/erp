-- Restaurant ERP — Increment 1: Recipes/BOM, Customers, POS Sales
-- Additive migration. No existing table is altered destructively.

-- 1) Extend InventoryTxType enum -------------------------------------------------
ALTER TYPE "InventoryTxType" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "InventoryTxType" ADD VALUE IF NOT EXISTS 'PRODUCTION_CONSUME';
ALTER TYPE "InventoryTxType" ADD VALUE IF NOT EXISTS 'PRODUCTION_YIELD';
ALTER TYPE "InventoryTxType" ADD VALUE IF NOT EXISTS 'RETURN_IN';

-- 2) New enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "OrderChannel" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'QR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'HELD', 'COMPLETED', 'VOIDED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'QR', 'STORE_CREDIT', 'LOYALTY', 'GIFT_CARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Recipes ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "recipes" (
  "id"             SERIAL PRIMARY KEY,
  "productId"      INTEGER NOT NULL,
  "name"           TEXT NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "yieldQty"       DOUBLE PRECISION NOT NULL DEFAULT 1,
  "yieldUnitId"    INTEGER,
  "prepLossPct"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cookingLossPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "wastePct"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"          TEXT,
  "notesAr"        TEXT,
  "imageUrl"       TEXT,
  "isApproved"     BOOLEAN NOT NULL DEFAULT false,
  "createdById"    INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recipes_productId_fkey"   FOREIGN KEY ("productId")   REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recipes_yieldUnitId_fkey" FOREIGN KEY ("yieldUnitId") REFERENCES "units"("id")    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recipes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id")    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "recipes_productId_isActive_idx" ON "recipes"("productId", "isActive");

-- 4) Recipe components -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "recipe_components" (
  "id"                 SERIAL PRIMARY KEY,
  "recipeId"           INTEGER NOT NULL,
  "componentProductId" INTEGER NOT NULL,
  "quantity"           DOUBLE PRECISION NOT NULL,
  "unitId"             INTEGER,
  "wastePct"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"              TEXT,
  CONSTRAINT "recipe_components_recipeId_fkey"           FOREIGN KEY ("recipeId")           REFERENCES "recipes"("id")  ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "recipe_components_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recipe_components_unitId_fkey"             FOREIGN KEY ("unitId")             REFERENCES "units"("id")    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "recipe_components_recipeId_idx" ON "recipe_components"("recipeId");
CREATE INDEX IF NOT EXISTS "recipe_components_componentProductId_idx" ON "recipe_components"("componentProductId");

-- 5) Customers -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customers" (
  "id"            SERIAL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "phone"         TEXT,
  "email"         TEXT,
  "group"         TEXT,
  "loyaltyPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditLimit"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "birthday"      TIMESTAMP(3),
  "notes"         TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_phone_key" ON "customers"("phone");
CREATE INDEX IF NOT EXISTS "customers_phone_idx" ON "customers"("phone");

-- 6) Orders ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "orders" (
  "id"            SERIAL PRIMARY KEY,
  "orderNo"       TEXT NOT NULL,
  "branchId"      INTEGER NOT NULL,
  "channel"       "OrderChannel" NOT NULL DEFAULT 'DINE_IN',
  "status"        "OrderStatus"  NOT NULL DEFAULT 'OPEN',
  "customerId"    INTEGER,
  "tableName"     TEXT,
  "subtotal"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxTotal"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "serviceCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tip"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paidTotal"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "foodCost"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossProfit"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"         TEXT,
  "createdById"   INTEGER,
  "completedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "branches"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_customerId_fkey"  FOREIGN KEY ("customerId")  REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "orders_orderNo_key" ON "orders"("orderNo");
CREATE INDEX IF NOT EXISTS "orders_branchId_status_idx" ON "orders"("branchId", "status");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders"("status");
CREATE INDEX IF NOT EXISTS "orders_customerId_idx" ON "orders"("customerId");
CREATE INDEX IF NOT EXISTS "orders_createdAt_idx" ON "orders"("createdAt");

-- 7) Order items -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "order_items" (
  "id"        SERIAL PRIMARY KEY,
  "orderId"   INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity"  DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "discount"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitCost"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineCost"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"     TEXT,
  CONSTRAINT "order_items_orderId_fkey"   FOREIGN KEY ("orderId")   REFERENCES "orders"("id")   ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX IF NOT EXISTS "order_items_productId_idx" ON "order_items"("productId");

-- 8) Payments --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payments" (
  "id"           SERIAL PRIMARY KEY,
  "orderId"      INTEGER NOT NULL,
  "method"       "PaymentMethod" NOT NULL,
  "amount"       DOUBLE PRECISION NOT NULL,
  "reference"    TEXT,
  "receivedById" INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_orderId_fkey"      FOREIGN KEY ("orderId")      REFERENCES "orders"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id")  ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payments_orderId_idx" ON "payments"("orderId");
