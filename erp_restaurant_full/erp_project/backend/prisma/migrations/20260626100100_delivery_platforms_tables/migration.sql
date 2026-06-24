-- Restaurant ERP — third-party delivery aggregator reconciliation.
-- Additive & idempotent. Runs after the enum-value migration so the new
-- 'AGGREGATOR' value is safe to use as a column default here.

-- Aggregator reconciliation fields on the order.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryPlatformId" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "netPayout" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "platformRef" TEXT;

-- Delivery platform config table.
CREATE TABLE IF NOT EXISTS "delivery_platforms" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "OrderChannel" NOT NULL DEFAULT 'AGGREGATOR',
  "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "payoutTermDays" INTEGER NOT NULL DEFAULT 7,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_platforms_pkey" PRIMARY KEY ("id")
);
