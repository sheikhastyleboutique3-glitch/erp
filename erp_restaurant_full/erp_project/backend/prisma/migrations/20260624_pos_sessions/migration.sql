-- Restaurant ERP — POS sessions & cash control (Odoo POS parity). Additive.
DO $$ BEGIN CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN','CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "pos_sessions" (
  "id"             SERIAL PRIMARY KEY,
  "sessionNo"      TEXT NOT NULL,
  "branchId"       INTEGER NOT NULL,
  "status"         "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openingFloat"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "closingCounted" DOUBLE PRECISION,
  "openedById"     INTEGER,
  "closedById"     INTEGER,
  "openedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"       TIMESTAMP(3),
  "notes"          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_sessionNo_key" ON "pos_sessions"("sessionNo");
CREATE INDEX IF NOT EXISTS "pos_sessions_branchId_status_idx" ON "pos_sessions"("branchId", "status");

CREATE TABLE IF NOT EXISTS "pos_cash_movements" (
  "id"          SERIAL PRIMARY KEY,
  "sessionId"   INTEGER NOT NULL REFERENCES "pos_sessions"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "reason"      TEXT,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "pos_cash_movements_sessionId_idx" ON "pos_cash_movements"("sessionId");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sessionId" INTEGER;
