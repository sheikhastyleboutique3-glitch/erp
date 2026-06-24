-- Restaurant ERP — stocktake / inventory count (variance audit). Additive.
CREATE TABLE IF NOT EXISTS "stock_counts" (
  "id"                 SERIAL PRIMARY KEY,
  "countNo"            TEXT NOT NULL,
  "branchId"           INTEGER NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'DRAFT',
  "totalVarianceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"              TEXT,
  "createdById"        INTEGER,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt"        TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "stock_counts_countNo_key" ON "stock_counts"("countNo");
CREATE INDEX IF NOT EXISTS "stock_counts_branchId_idx" ON "stock_counts"("branchId");

CREATE TABLE IF NOT EXISTS "stock_count_items" (
  "id"            SERIAL PRIMARY KEY,
  "countId"       INTEGER NOT NULL REFERENCES "stock_counts"("id") ON DELETE CASCADE,
  "productId"     INTEGER NOT NULL,
  "systemQty"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "countedQty"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "variance"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitCost"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "varianceValue" DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "stock_count_items_countId_idx" ON "stock_count_items"("countId");
