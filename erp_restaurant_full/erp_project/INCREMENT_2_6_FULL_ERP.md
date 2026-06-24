# Increments 2-6 — Production, Finance, KDS, Sales Analytics, Tables, Promotions, Auto-Reorder

Builds on Increment 1. **Verified:** backend `tsc --noEmit` passes with zero errors and the
frontend `vite build` succeeds (`✓ built`).

## New backend modules (NestJS, all under `/api`, JWT + RBAC)

### Increment 2 — Production / Central Kitchen (`/production`)
Consumes raw/semi components and yields finished/semi product through the existing FEFO
inventory engine. A run rolls back entirely if any component is short.
- `GET /production`, `GET /production/:id`
- `POST /production` `{ branchId, productId, plannedQty, recipeId?, batchNumber?, expiryDate? }` — explodes the active recipe into planned consumption lines.
- `PATCH /production/:id/start`, `PATCH /production/:id/cancel`
- `POST /production/:id/complete` `{ producedQty? }` — deducts components (`PRODUCTION_CONSUME`), yields the product (`PRODUCTION_YIELD`, stamps batch/expiry + rolled-up unit cost).
- Tables: `production_orders`, `production_consumptions`.

### Increment 3 — Finance journal (`/finance`)
Append-only signed entries (revenue +, cost −). A completed **sale** now auto-posts
`SALE_REVENUE`, `COGS` (+ `TAX`/`SERVICE_CHARGE`/`TIP`) inside the same transaction.
Production is treated as a stock transformation, so COGS is recognised at sale (no double count).
- `GET /finance/entries?branchId&type&from&to`
- `GET /finance/summary?branchId&from&to` → revenue, cogs, grossProfit, foodCostPct, net.
- Table: `finance_entries`.

### Increment 4 — Kitchen Display (`/kds`) + Sales Analytics (`/analytics`)
- `GET /kds/board?branchId` → open line items grouped `QUEUED|PREPARING|READY`.
- `PATCH /kds/items/:id` `{ status }` → advances a ticket; stamps `firedAt`/`readyAt`.
- `GET /kds/performance?branchId&from&to` → avg prep seconds.
- `GET /analytics/sales-summary?period=today|week|month&branchId` → revenue, orders, gross profit, food-cost %, avg ticket, payment mix.
- `GET /analytics/best-sellers`, `GET /analytics/top-customers`.
- OrderItem gained `kdsStatus`, `firedAt`, `readyAt`.

### Increment 6 — Tables/Reservations, Promotions, Auto-Reorder
- **Tables** `GET/POST/PATCH/DELETE /tables`, `GET/POST /reservations`, `PATCH /reservations/:id/status` (auto-syncs table status). Tables: `restaurant_tables`, `reservations`. Order gained `tableId`.
- **Promotions** `/promotions/gift-cards` (create/list/get/redeem) and `/promotions/coupons` (create/list/validate/redeem, PERCENT or FIXED). Tables: `gift_cards`, `coupons`.
- **Replenishment** `GET /replenishment/suggestions?branchId&coverDays&lookbackDays` → auto-reorder list from on-hand vs reorder point, sized by recent sales velocity (SALE/PRODUCTION_CONSUME/WASTAGE over a lookback window).

## New frontend pages (React + Vite + Tailwind, bilingual nav)
- **POS** (`/pos`) — category-filtered product grid, cart with qty/price controls, channel + table, one-tap **Charge (Cash)** that creates the order, takes payment, and completes it (firing the auto-deduction). Roles: SUPER_ADMIN, BRANCH_MANAGER, CASHIER.
- **Kitchen Display** (`/kds`) — 3-column live board (8s refresh) with Start → Ready → Served. Roles: kitchen/pastry/barista + managers.
- **Sales Dashboard** (`/sales-dashboard`) — today/week/month KPIs, best-sellers chart (Recharts), payment mix, top customers. Roles: managers/admin.
- Routes registered in `App.tsx`; nav entries + EN/AR labels added.

## Apply
```bash
cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run start:dev
cd ../frontend && npm install && npm run build   # or: npm run dev
```
Migrations to run (additive, reversible): `20260624_restaurant_pos_recipes` then
`20260624_restaurant_production_finance_pos`.

## Honest status
- All code **type-checks and builds**; it has **not** been run against a live Postgres or
  end-to-end tested in this environment. Use a staging DB and the smoke tests in
  `INCREMENT_1_POS_RECIPES.md` plus a production run + KDS advance + dashboard check.
- POS uses each line's entered `unitPrice` (a dedicated menu-pricing layer is still a good
  future addition). Coupon/gift-card redemption endpoints exist but are not yet auto-applied
  inside `order.complete` — they're ready to wire into the POS discount flow next.
- UI delivered for the three headline surfaces (POS, KDS, Sales Dashboard). Production,
  Tables/Reservations, and Promotions are fully API-backed; their admin screens are the
  natural next UI pass.
