-- Restaurant ERP — printer routing for KOT (kitchen / barista / pastry).
-- Additive & idempotent.

DO $$ BEGIN
  CREATE TYPE "ConnectionType" AS ENUM ('USB', 'IP', 'IOT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "printers" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "connection" "ConnectionType" NOT NULL DEFAULT 'IP',
  "ipAddress" TEXT,
  "port" INTEGER DEFAULT 9100,
  "usbPort" TEXT,
  "widthMm" INTEGER NOT NULL DEFAULT 80,
  "branchId" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- Link categories to a printer.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "printerId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "categories"
    ADD CONSTRAINT "categories_printerId_fkey"
    FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
