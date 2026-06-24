-- Restaurant ERP — DRIVER role + delivery dispatch/manifests (additive).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DRIVER';

DO $$ BEGIN CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "order_deliveries" (
  "id"           SERIAL PRIMARY KEY,
  "orderId"      INTEGER NOT NULL,
  "branchId"     INTEGER NOT NULL,
  "driverId"     INTEGER,
  "status"       "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "address"      TEXT,
  "phone"        TEXT,
  "notes"        TEXT,
  "assignedAt"   TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "deliveredAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "order_deliveries_orderId_key" ON "order_deliveries"("orderId");
CREATE INDEX IF NOT EXISTS "order_deliveries_branchId_status_idx" ON "order_deliveries"("branchId", "status");
CREATE INDEX IF NOT EXISTS "order_deliveries_driverId_status_idx" ON "order_deliveries"("driverId", "status");
