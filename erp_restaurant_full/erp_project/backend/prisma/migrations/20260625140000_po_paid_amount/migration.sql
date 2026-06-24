-- Restaurant ERP — accounts payable: amount paid to supplier on a PO. Additive.
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
