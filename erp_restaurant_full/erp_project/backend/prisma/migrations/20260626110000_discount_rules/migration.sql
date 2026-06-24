-- Restaurant ERP — reusable discount rules + order discount audit trail.
-- Additive & idempotent.

-- New enums (creating + using a brand-new enum in the same transaction is safe;
-- only ALTER TYPE ... ADD VALUE on an existing enum has the same-tx restriction).
DO $$ BEGIN
  CREATE TYPE "DiscountScope" AS ENUM ('ORDER', 'ITEM', 'CATEGORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED', 'BOGO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Discount rule table.
CREATE TABLE IF NOT EXISTS "discount_rules" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "scope" "DiscountScope" NOT NULL DEFAULT 'ORDER',
  "type" "DiscountType" NOT NULL DEFAULT 'PERCENT',
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "categoryId" INTEGER,
  "productId" INTEGER,
  "minOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "requiresManagerApproval" BOOLEAN NOT NULL DEFAULT false,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "discount_rules_isActive_idx" ON "discount_rules"("isActive");

-- Order-level applied discount + audit reason.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountRuleId" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ruleDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
