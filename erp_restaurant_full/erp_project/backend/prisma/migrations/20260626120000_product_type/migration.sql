-- Restaurant ERP — explicit product classification (warehouse vs menu).
-- Additive & idempotent. Backfills from the existing isSellable flag + recipes.

DO $$ BEGIN
  CREATE TYPE "ProductType" AS ENUM ('RAW', 'SEMI_FINISHED', 'MENU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "productType" "ProductType" NOT NULL DEFAULT 'MENU';

-- Backfill: sellable items are MENU, everything else starts as RAW.
UPDATE "products" SET "productType" = 'MENU' WHERE "isSellable" = true;
UPDATE "products" SET "productType" = 'RAW'  WHERE "isSellable" = false;

-- A non-sellable product that itself has a recipe is a prepped SEMI_FINISHED
-- component (e.g. dough, sauce) rather than a raw purchased ingredient.
UPDATE "products" p
   SET "productType" = 'SEMI_FINISHED'
 WHERE p."isSellable" = false
   AND EXISTS (SELECT 1 FROM "recipes" r WHERE r."productId" = p."id");
