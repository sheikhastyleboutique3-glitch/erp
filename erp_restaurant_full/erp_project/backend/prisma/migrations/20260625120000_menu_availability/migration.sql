-- Restaurant ERP — temporary "86" availability toggle on menu items. Additive.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
