-- Restaurant ERP — per-category kitchen station for KDS/KOT routing (additive).
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "station" TEXT;
