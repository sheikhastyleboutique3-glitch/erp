-- Restaurant ERP — coupon discount fields on orders (additive)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponCode"     TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
