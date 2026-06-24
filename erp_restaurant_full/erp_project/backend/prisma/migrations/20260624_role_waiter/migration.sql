-- Restaurant ERP — Increment 9: add front-of-house WAITER role.
-- Additive enum value. ADD VALUE IF NOT EXISTS is idempotent (PG 12+).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAITER';
