# GWK V7 → Enterprise Restaurant ERP — Analysis & Implementation Roadmap

_Phase 1 deliverable. Authored from a full read of the existing codebase (NestJS backend + React frontend + Prisma schema)._

---

## 1. What the system actually is today

GWK V7 is a **back-of-house, multi-branch supply-chain & inventory platform** for an F&B group, **not** a bare Express app. Stack:

| Layer | Technology |
|---|---|
| Backend | NestJS 10, modular (controller / service / module), Prisma 5, PostgreSQL |
| Auth | JWT (passport-jwt), RBAC via `@Roles`, branch-isolation guard, throttler, helmet |
| Frontend | React 18, Vite 5, Tailwind 3, React Query, React Router 6, i18next (EN/AR), Recharts, @react-pdf |
| Infra | Dockerfiles (backend + frontend), serve-static, swagger at `/api/docs` |

### 1.1 Modules present (22)
auth, users, branches, categories, units, products, suppliers, **inventory** (batch/FEFO/expiry), requisitions, purchase-orders, transfers, wastage, alerts (+scheduler), audit, settings, admin (system reset), pricing, reports, notifications, drivers, uploads.

### 1.2 Data model (37 models/enums) — strengths
- **Batch tracking with FEFO**: `Batch`, `Inventory(productId,branchId,batchId)` unique row, `expiryDate`, `manufactureDate`, `unitCost` per batch.
- **Immutable ledger**: every stock change writes an `InventoryTransaction` with `balanceBefore`/`balanceAfter` — perfect foundation for financial costing.
- **Proven deduction engine**: `InventoryService.applyManualAdjustment` + `planFefoAllocation` already do row-locked, serializable, FEFO multi-batch deduction with retry on serialization conflict. **This is the single most reusable asset in the codebase** — new sale/production deductions must route through it, not reinvent it.
- Multi-branch via `UserBranch` junction; expiry/low-stock alerts; supplier price history; per-user notification inbox.

### 1.3 Honest gaps vs. the "restaurant ERP" target
The current system covers procurement → warehouse → branch replenishment. The **entire revenue and manufacturing side is absent**:

| Capability requested | Status today |
|---|---|
| POS / Sales / Orders | ❌ no Order/Sale model at all |
| Payments (cash, card, wallet, split, etc.) | ❌ none |
| Customers / loyalty / store credit | ❌ none |
| **Structured Recipe / BOM** | ⚠️ only a free-text `Product.recipe` string |
| Automatic recipe-based deduction on sale | ❌ none (manual adjustments only) |
| Production / central-kitchen orders | ❌ none |
| Kitchen Display System | ❌ none |
| Tables / reservations / hold-resume / split bills | ❌ none |
| Thermal / ESC-POS printing | ❌ none (PDF invoices only) |
| Finance records (revenue, COGS journal) | ❌ none |
| Sales/profit dashboards | ⚠️ dashboard exists but is supply-chain only |

### 1.4 Code-quality observations
- Tests exist but are thin (a handful of `*.spec.ts`); no e2e coverage of workflows.
- Strong consistency in module structure — new modules should mirror `suppliers`/`inventory` exactly.
- `costPrice`, `taxCategory`, `yieldFactor` already exist on `Product` — pre-wired for costing and recipes.
- No event bus yet; alerts use `@nestjs/schedule`. For "every sale updates dashboards/finance" use Nest's built-in `EventEmitter` rather than inline coupling.

---

## 2. Architecture decisions for the expansion
1. **Preserve the database.** All additions are new tables + new enum values; **no destructive changes** to existing models. Existing data and workflows keep working.
2. **Reuse the inventory engine.** Sales and production deductions call `InventoryService.applyManualAdjustment` inside one serializable transaction so FEFO, batch costing, and the ledger stay authoritative. No parallel stock logic.
3. **Recipe = Bill of Materials.** A finished/sellable `Product` gets an active `Recipe` whose `RecipeComponent`s point at ingredient/semi-finished products with per-unit quantities and loss factors. Selling 1 unit explodes the BOM and deducts each component.
4. **Costing snapshot at point of sale.** Each `Order` stores `foodCost` and `grossProfit` captured at completion, so reports are immutable even if product costs change later.
5. **Versioned, additive APIs.** New controllers live alongside existing ones; nothing existing is renamed.

---

## 3. Phased roadmap (recommended build order)

### ✅ Increment 0 — Analysis (this document)

### ✅ Increment 1 — Keystone: Recipe/BOM + POS Sales + auto-deduction  ← _built in this pass_
- Schema: `Recipe`, `RecipeComponent`, `Customer`, `Order`, `OrderItem`, `Payment`; new enums `OrderChannel`, `OrderStatus`, `PaymentMethod`; extend `InventoryTxType` with `SALE`, `PRODUCTION_CONSUME`, `PRODUCTION_YIELD`, `RETURN_IN`.
- Modules: `recipes` (BOM CRUD + recipe-cost rollup), `customers` (CRUD + loyalty points), `sales` (open order → add items → take payment → **complete = auto BOM deduction via FEFO + food-cost & gross-profit calc + loyalty accrual**).
- Migration SQL included.

### Increment 2 — Production / Central Kitchen
`ProductionOrder` + `ProductionConsumption`: consume raw ingredients (`PRODUCTION_CONSUME`) and yield semi/finished goods (`PRODUCTION_YIELD`) through the same ledger; batch + expiry on yielded output.

### Increment 3 — Finance journal
`FinanceEntry` rows auto-generated from sales (revenue + COGS), purchases, wastage, production — ready for future accounting integration.

### Increment 4 — POS front-end + KDS
Touch POS page (catalog grid, cart, modifiers, split/hold), Kitchen Display board (order queue → preparing → ready), live updates via polling/websocket.

### Increment 5 — Sales dashboards & reports
Today/week/month sales, gross profit, food-cost %, best sellers, top customers — built on the `Order`/`Payment` tables.

### Increment 6 — Printing, tables/reservations, gift cards/coupons, demand forecasting / auto-reorder, hardening (rate limits per route, e2e tests, ESLint/Prettier CI).

---

## 4. Testing & rollout guidance
- Run `prisma migrate dev` against a **branch/staging DB** first; the included migration is additive and reversible (drop new tables).
- Seed one finished product (e.g. *Chicken Burger*) with a recipe of existing ingredient SKUs, then place a test sale and confirm `inventory_transactions` shows one `SALE` row per ingredient and stock drops via FEFO.
- Each subsequent increment ships with its own module + migration so the system stays releasable at every step.

> This roadmap keeps every existing workflow intact while incrementally turning the supply-chain platform into a full restaurant ERP. Increment 1 (below) is implemented in this pass; the rest are scoped and sequenced for safe, releasable delivery.
