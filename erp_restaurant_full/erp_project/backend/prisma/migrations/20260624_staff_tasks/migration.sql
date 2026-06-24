-- Restaurant ERP — Increment 8: ancillary staff tasks & checklists.
-- Additive. Reversible by dropping the table and the three enum types.

DO $$ BEGIN CREATE TYPE "StaffTaskCategory" AS ENUM ('CLEANING','MAINTENANCE','OPENING','CLOSING','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StaffTaskStatus" AS ENUM ('PENDING','IN_PROGRESS','DONE','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StaffTaskPriority" AS ENUM ('LOW','NORMAL','HIGH','URGENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "staff_tasks" (
  "id"           SERIAL PRIMARY KEY,
  "branchId"     INTEGER NOT NULL,
  "title"        TEXT NOT NULL,
  "titleAr"      TEXT,
  "description"  TEXT,
  "category"     "StaffTaskCategory" NOT NULL DEFAULT 'CLEANING',
  "status"       "StaffTaskStatus" NOT NULL DEFAULT 'PENDING',
  "priority"     "StaffTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "assignedToId" INTEGER,
  "createdById"  INTEGER,
  "dueAt"        TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "checklist"    JSONB,
  "recurrence"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "staff_tasks_branchId_status_idx" ON "staff_tasks"("branchId", "status");
CREATE INDEX IF NOT EXISTS "staff_tasks_assignedToId_idx" ON "staff_tasks"("assignedToId");
