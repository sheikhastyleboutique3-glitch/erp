# ERP V8 — Security & Performance Audit

**Scope:** NestJS + Prisma + PostgreSQL backend (19 modules, 25 models) and the
React/Vite frontend. **Method:** static code review + dependency inspection.
**Legend:** ✅ Fixed in this engagement · 🔧 Open / recommended · 🟢 Already good.

---

## Severity summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Non-atomic stock movements (requisitions) | 🔴 Critical | ✅ Fixed |
| 2 | Non-atomic stock movements (purchase orders) | 🔴 Critical | ✅ Fixed |
| 3 | No automated tests | 🟠 High | ✅ 34 tests added |
| 4 | No security headers / rate limiting / compression | 🟠 High | ✅ Fixed |
| 5 | Validation bypass on untyped request bodies | 🟠 High | ◑ Auth fixed; others open |
| 6 | Refresh tokens cannot be revoked | 🟠 High | 🔧 Open |
| 7 | Unbounded list queries (no pagination) | 🟠 High | ◑ Capped; full pagination open |
| 8 | Missing DB indexes | 🟡 Medium | ✅ Fixed |
| 9 | bcrypt cost factor 10 | 🟡 Medium | ✅ Raised to 12 |
| 10 | Fire-and-forget audit writes | 🟡 Medium | 🔧 Open |
| 11 | `console.log` + branding drift in backend | 🟢 Low | 🔧 Open |

---

## Security findings

### ✅ 1 & 2 — Atomic stock movements (CRITICAL, fixed)
`requisitions.confirmReceipt/managerReview/procurementUpdate` and
`purchase-orders.updateStatus/receive` previously ran several writes (stock
adjustment + line updates + status change) **outside any transaction**. A
mid-loop failure could credit inventory against a requisition/PO that never
transitioned — silent stock corruption.
**Fix:** introduced `runSerializable()` (Serializable isolation + P2034 retry) in
both services, and refactored `inventory.adjust()` into a composable
`applyAdjustment(tx, …)` so every stock move now commits in the *same*
transaction as its parent document. Covered by tests (see §3).

### ✅ 4 — Transport & request hardening (fixed)
Added **helmet** (security headers), **compression** (gzip), and
**@nestjs/throttler** (global 100 req/min/IP). Login is throttled to **5/min/IP**
and refresh to 10/min/IP — closes the open brute-force vector on `/auth/login`.

### ◑ 5 — Validation bypass on untyped bodies (auth fixed; others open)
The global `ValidationPipe` (whitelist + forbidNonWhitelisted) is correctly
configured, but ~25 handlers typed bodies as `@Body() dto: any`, which disables
validation for those routes. **Fixed for auth** (new `auth/dto/auth.dto.ts` with
`class-validator`). **Open:** apply the same DTO treatment to requisitions,
purchase-orders, inventory, products, suppliers, etc.

### 🔧 6 — Refresh-token revocation (open)
Refresh tokens are signed but never stored, so they cannot be invalidated on
logout or compromise. **Recommend:** persist a token id / version per user (or a
denylist) and rotate on each refresh.

### ✅ 9 — Password hashing (fixed)
bcrypt cost factor raised **10 → 12** in `auth` and `users` services.

### 🟢 Already good
- JWT auth + `JwtAuthGuard` with explicit expired/invalid handling.
- `RolesGuard` + `BranchIsolationGuard` (SUPER_ADMIN bypass, per-branch scoping).
- Inventory writes use `SELECT … FOR UPDATE` row locking + serialization retry.
- CORS allow-list enforced in production; secrets read from env, not hard-coded.

---

## Performance findings

### ✅ 8 — Missing indexes (fixed)
Added indexes to 9 hot tables: `requisitions (branchId+status, status,
createdById, createdAt)`, `requisition_items`, `requisition_status_history`,
`inventory_transactions (productId+branchId, branchId, createdAt)`,
`audit_logs (entity+entityId, userId, createdAt)`, `alerts`, `purchase_orders`,
`wastage_records`, `products`. Requires a migration (see below).

### ◑ 7 — Pagination (capped; full pagination open)
17 `findMany` calls had no `skip`/`take`. The biggest unbounded query
(requisitions list) now has a `take: 500` safety cap; audit logs and inventory
transactions were already capped at 200. **Open:** implement real `{ data, total,
page }` pagination across list endpoints + matching frontend tables.

### 🔧 10 — Fire-and-forget audit/notification writes
`this.audit.create(...)` and notification emits are intentionally not awaited so
they never break the main flow — good for resilience, but audit entries can be
**silently lost** under load/error. **Recommend:** enqueue them (e.g. a light
in-process queue or `@nestjs/bull`) so failures are retried, not dropped.

### 🟢 Good
- React Query on the frontend (client caching + dedupe).
- Sharp auto-compresses uploaded images.
- `@nestjs/schedule` used for the hourly alert cron rather than ad-hoc timers.

---

## Required migration after these changes
```bash
cd backend
npm install                 # helmet, compression, @nestjs/throttler, jest, supertest…
npx prisma generate
npx prisma migrate dev --name add_indexes_and_hardening
npm test                    # 34/34 pass
npm run build               # clean
```

## Recommended next actions (priority order)
1. DTOs for the remaining `@Body() dto: any` handlers (finding #5).
2. Refresh-token persistence + rotation (#6).
3. Full pagination + frontend tables (#7).
4. Durable audit/notification delivery (#10).
5. Replace `console.log` with Nest `Logger`; unify "GWK V7"/"ERP V8" branding (#11).
