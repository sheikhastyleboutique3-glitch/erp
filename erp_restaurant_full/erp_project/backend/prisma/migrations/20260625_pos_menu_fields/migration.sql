-- Restaurant ERP — POS menu: sellable flag + category image. Additive.

-- 1) Sellable / menu-item flag on products (default true).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isSellable" BOOLEAN NOT NULL DEFAULT true;

-- 2) Auto-classify raw materials: anything used as a recipe component is an
--    ingredient, not a sellable menu item -> hide it from the POS grid.
UPDATE "products"
   SET "isSellable" = false
 WHERE "id" IN (SELECT DISTINCT "componentProductId" FROM "recipe_components");

-- 3) Optional category image for the POS category selector.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
