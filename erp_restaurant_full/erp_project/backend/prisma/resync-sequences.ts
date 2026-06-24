/**
 * resync-sequences.ts
 *
 * Re-aligns every Postgres auto-increment (id) sequence with the current
 * MAX(id) in its table.
 *
 * Why this exists: the seed inserts rows with EXPLICIT ids
 * (e.g. `alert.upsert({ ... id: 1 ... })`). Postgres does NOT advance a table's
 * identity/serial sequence when you supply an explicit id, so the sequence
 * stays at 1. The first runtime `create()` (e.g. the alerts scheduler) then
 * asks for nextval = 1, which already exists, producing:
 *   "Unique constraint failed on the fields: (`id`)".
 *
 * Running this once repairs a live database; the seed also calls it on every
 * run so the problem never recurs.
 *
 * Usage:  npm run db:resync     (from the backend folder)
 */
import { PrismaClient } from '@prisma/client';

// Every table backed by an integer `id` serial. (Join/config tables without a
// serial id are simply skipped — pg_get_serial_sequence returns null.)
export const ID_TABLES = [
  'alerts',
  'audit_logs',
  'batches',
  'branches',
  'categories',
  'inventory',
  'inventory_transactions',
  'notification_configs',
  'products',
  'purchase_order_items',
  'purchase_orders',
  'requisition_dispatches',
  'requisition_items',
  'requisition_status_history',
  'requisitions',
  'settings',
  'supplier_price_history',
  'suppliers',
  'system_reset_logs',
  'transfer_order_items',
  'transfer_orders',
  'units',
  'user_branches',
  'user_notification_preferences',
  'users',
  'wastage_records',
];

/**
 * Set each table's id sequence to MAX(id) (so the next insert gets MAX(id)+1),
 * or back to 1 when the table is empty. Idempotent and safe to run anytime.
 */
export async function resyncSequences(
  prisma: PrismaClient,
  tables: string[] = ID_TABLES,
): Promise<{ table: string; nextval: number | null; skipped?: boolean }[]> {
  const results: { table: string; nextval: number | null; skipped?: boolean }[] = [];
  for (const table of tables) {
    try {
      const seqRows = await prisma.$queryRawUnsafe<{ seq_name: string | null }[]>(
        `SELECT pg_get_serial_sequence('"${table}"', 'id') AS seq_name`,
      );
      const seqName = seqRows?.[0]?.seq_name;
      if (!seqName) {
        results.push({ table, nextval: null, skipped: true });
        continue;
      }
      // setval(seq, MAX(id), true) -> next is MAX(id)+1 when rows exist.
      // setval(seq, 1, false)      -> next is 1 when the table is empty.
      await prisma.$executeRawUnsafe(
        `SELECT setval(
           '${seqName}',
           COALESCE((SELECT MAX(id) FROM "${table}"), 1),
           (SELECT MAX(id) FROM "${table}") IS NOT NULL
         )`,
      );
      const maxRows = await prisma.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX(id) AS max FROM "${table}"`,
      );
      const max = maxRows?.[0]?.max ?? 0;
      results.push({ table, nextval: Number(max) + 1 });
    } catch (e) {
      // Skip tables that don't exist / have no serial id without failing the run.
      results.push({ table, nextval: null, skipped: true });
    }
  }
  return results;
}

// Allow running standalone: `npm run db:resync`
if (require.main === module) {
  const prisma = new PrismaClient();
  resyncSequences(prisma)
    .then((rows) => {
      const fixed = rows.filter((r) => !r.skipped);
      console.log(`✅ Resynced ${fixed.length} id sequence(s):`);
      fixed.forEach((r) => console.log(`   • ${r.table} → next id ${r.nextval}`));
      const skipped = rows.filter((r) => r.skipped);
      if (skipped.length) {
        console.log(`   (skipped ${skipped.length}: ${skipped.map((s) => s.table).join(', ')})`);
      }
    })
    .catch((err) => {
      console.error('Sequence resync failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
