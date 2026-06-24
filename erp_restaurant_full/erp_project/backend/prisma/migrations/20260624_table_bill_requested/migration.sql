-- Restaurant ERP — add BILL_REQUESTED state to tables (Waiter flow).
-- Additive enum value. ADD VALUE is idempotent via IF NOT EXISTS (PG 12+).
ALTER TYPE "TableStatus" ADD VALUE IF NOT EXISTS 'BILL_REQUESTED';
