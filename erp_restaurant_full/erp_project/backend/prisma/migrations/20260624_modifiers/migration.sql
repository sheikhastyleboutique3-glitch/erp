-- Restaurant ERP — product modifiers / combos (Odoo POS parity). Additive.
CREATE TABLE IF NOT EXISTS "modifier_groups" (
  "id"        SERIAL PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "nameAr"    TEXT,
  "minSelect" INTEGER NOT NULL DEFAULT 0,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "required"  BOOLEAN NOT NULL DEFAULT false,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "modifier_options" (
  "id"                 SERIAL PRIMARY KEY,
  "groupId"            INTEGER NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
  "name"               TEXT NOT NULL,
  "nameAr"             TEXT,
  "priceDelta"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "componentProductId" INTEGER,
  "qtyToDeduct"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "modifier_options_groupId_idx" ON "modifier_options"("groupId");

CREATE TABLE IF NOT EXISTS "product_modifier_groups" (
  "id"        SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL,
  "groupId"   INTEGER NOT NULL REFERENCES "modifier_groups"("id") ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_modifier_groups_productId_groupId_key" ON "product_modifier_groups"("productId", "groupId");
CREATE INDEX IF NOT EXISTS "product_modifier_groups_productId_idx" ON "product_modifier_groups"("productId");

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "modifiers" JSONB;
