-- Restaurant ERP — aggregator enum values (Talabat / Snoonu).
-- Enum-only migration. A newly added enum value cannot be USED in the same
-- transaction it was added in, so the table/columns that reference these
-- values live in the following migration (20260626100100_delivery_platforms_tables).
-- IF NOT EXISTS keeps each ADD VALUE idempotent on PostgreSQL 12+.
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'TALABAT';
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'SNOONU';
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'AGGREGATOR';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'AGGREGATOR';
