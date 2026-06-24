-- Restaurant ERP — sales orders / quotations (Odoo sale). Additive.
DO $$ BEGIN CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT','CONFIRMED','FULFILLED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "sales_quotes" (
  "id"          SERIAL PRIMARY KEY,
  "quoteNo"     TEXT NOT NULL,
  "branchId"    INTEGER NOT NULL,
  "customerId"  INTEGER,
  "status"      "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"       TEXT,
  "subtotal"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "orderId"     INTEGER,
  "validUntil"  TIMESTAMP(3),
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_quotes_quoteNo_key" ON "sales_quotes"("quoteNo");
CREATE INDEX IF NOT EXISTS "sales_quotes_branchId_status_idx" ON "sales_quotes"("branchId", "status");

CREATE TABLE IF NOT EXISTS "sales_quote_items" (
  "id"        SERIAL PRIMARY KEY,
  "quoteId"   INTEGER NOT NULL REFERENCES "sales_quotes"("id") ON DELETE CASCADE,
  "productId" INTEGER NOT NULL,
  "quantity"  DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "sales_quote_items_quoteId_idx" ON "sales_quote_items"("quoteId");
