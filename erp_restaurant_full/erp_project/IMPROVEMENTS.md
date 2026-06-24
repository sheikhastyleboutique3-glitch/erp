# ERP V8 — Hardening & Reliability Improvements

This change set addresses the highest-impact data-integrity, security, and
testing gaps found in a code review. All changes are **backend** and have been
verified with `nest build` (passes) and `jest` (8/8 tests pass).

## 1. Atomic requisition workflow (data integrity — critical)
The requisition flow previously performed multiple sequential writes with no
transaction, so a mid-operation failure could leave inventory partially
credited or a status change without its history entry.

- `requisitions.service.ts`
  - Added `runSerializable()` helper — runs a unit of work in a single
    `Serializable` transaction with automatic retry on write-conflict (P2034).
  - `managerReview()` — item approved-qty edits + status change + history entry
    now commit atomically.
  - `procurementUpdate()` — dispatch upsert + status change + history entry now
    commit atomically (read-only driver lookup stays outside the transaction).
  - `confirmReceipt()` — **every item's `receivedQty` update + stock movement +
    dispatch confirmation + final status change now commit in ONE transaction.**
- `inventory.service.ts`
  - Extracted the core stock-mutation logic into `applyAdjustment(tx, dto)` so it
    can be composed inside an outer transaction (used by `confirmReceipt`).
  - Public `adjust()` keeps its existing self-retrying, row-locked behavior.

## 2. Security hardening
- `main.ts` — added **helmet** (security headers) and **compression** (gzip).
- `app.module.ts` — added **@nestjs/throttler** with a global 100 req/min/IP
  rate limit (`ThrottlerGuard` registered as `APP_GUARD`).
- `auth.controller.ts` — login limited to **5 attempts/min/IP**, refresh to
  10/min/IP (brute-force protection).
- Replaced untyped inline request bodies with validated DTOs
  (`auth/dto/auth.dto.ts`: `LoginDto`, `RefreshTokenDto`, `ChangePasswordDto`,
  `SwitchBranchDto`) so the global `ValidationPipe` actually validates auth input.
- bcrypt work factor raised from **10 → 12** in `auth` and `users` services.

## 3. Performance — database indexes
Added indexes to high-traffic / high-growth tables in `schema.prisma`:
requisitions, requisition_items, requisition_status_history,
inventory_transactions, audit_logs, alerts, purchase_orders, wastage_records,
products. Added a `take: 500` safety cap to the requisitions list query.

## 4. Test harness
- Added Jest + ts-jest config and `test`, `test:watch`, `test:cov` scripts.
- `requisitions.service.spec.ts` — 8 tests covering the state machine guards and
  verifying the new transactional behavior of review / procurement / receipt.

---

## Required steps after pulling these changes
```bash
cd backend
npm install                 # pulls helmet, compression, @nestjs/throttler, jest, etc.
npx prisma generate
npx prisma migrate dev --name add_indexes_and_hardening   # creates the new indexes
npm test                    # 8/8 should pass
npm run build
```

## Recommended follow-ups (not included here)
- Full page/limit pagination (with `{ data, total }` shape) across list endpoints
  and the matching frontend table updates.
- Replace remaining `@Body() dto: any` handlers in other modules with DTO classes.
- Persist + rotate refresh tokens so they can be revoked on logout/compromise.
- Split large frontend pages (AdminPage ~930 lines, CatalogPage ~795) into
  components + hooks.
- Expand test coverage to inventory, purchase-orders, and auth services.

---

## Round 2 — audits + expanded tests + PO transactions

- **Purchase orders made atomic.** `purchase-orders.service.ts` `updateStatus`
  (FULLY_RECEIVED) and `receive` now wrap all stock movements + supplier
  price-history + product cost update + line updates + status recompute in a
  single `runSerializable()` transaction, using `inventory.applyAdjustment(tx, …)`
  — same pattern as the requisitions fix.
- **Test coverage expanded to 34 tests across 4 suites** (all passing):
  - `requisitions.service.spec.ts` (8) — state machine + atomic flows
  - `inventory.service.spec.ts` (new) — add/deduct/set math, insufficient-stock
    guard, Serializable wrapper, P2034 retry, low-stock filter
  - `auth.service.spec.ts` (new) — login/inactive/bad-password, JWT payload,
    refresh, change-password (cost factor 12), branch switch + admin bypass
  - `purchase-orders.service.spec.ts` (new) — atomic full/partial receive,
    price-history, cost roll-up, guard conditions
- **Reports added:** `SECURITY_PERFORMANCE_AUDIT.md` and `UI_UX_AUDIT.md`.

Run `npm test` → 34/34 pass; `npm run build` → clean.
