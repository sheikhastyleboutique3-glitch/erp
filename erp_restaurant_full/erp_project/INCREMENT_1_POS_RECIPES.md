# Increment 1 — Recipe/BOM + POS Sales + Automatic Inventory Deduction

This increment turns GWK V7 from a supply-chain backend into a restaurant ERP core:
selling a menu item now **automatically explodes its recipe and deducts every
ingredient from branch stock via the existing FEFO engine** — no manual inventory
adjustments. ✅ The full backend type-checks clean (`tsc --noEmit`).

## What was added
- **Schema** (`prisma/schema.prisma`, additive only):
  - Models: `Recipe`, `RecipeComponent`, `Customer`, `Order`, `OrderItem`, `Payment`.
  - Enums: `OrderChannel`, `OrderStatus`, `PaymentMethod`; extended `InventoryTxType`
    with `SALE`, `PRODUCTION_CONSUME`, `PRODUCTION_YIELD`, `RETURN_IN`.
- **Migration**: `prisma/migrations/20260624_restaurant_pos_recipes/migration.sql` (additive, reversible — just drops the new tables).
- **Modules**: `src/modules/recipes`, `src/modules/customers`, `src/modules/sales`
  (registered in `app.module.ts`).
- **Inventory engine**: `SALE` / `PRODUCTION_CONSUME` are now deduction types and
  `PRODUCTION_YIELD` / `RETURN_IN` are addition types, so the existing
  `applyManualAdjustment` (row-locked, serializable, FEFO multi-batch) handles them.

## Apply it
```bash
cd backend
npm install
# Point DATABASE_URL at a staging DB first.
npx prisma migrate deploy        # applies the additive migration
npx prisma generate
npm run start:dev
```

## API (all under the global `/api` prefix, JWT + RBAC)
**Recipes** — `GET /recipes`, `GET /recipes/:id`, `GET /recipes/:id/cost`,
`POST /recipes`, `PATCH /recipes/:id`, `PATCH /recipes/:id/active`,
`PATCH /recipes/:id/approve`, `DELETE /recipes/:id`.

**Customers** — `GET /customers`, `GET /customers/:id`, `POST /customers`,
`PATCH /customers/:id`, `DELETE /customers/:id` (soft).

**Sales** — `POST /sales/orders` (open a ticket), `POST /sales/orders/:id/items`,
`DELETE /sales/orders/:id/items/:itemId`, `PATCH /sales/orders/:id/hold|resume|void`,
`POST /sales/orders/:id/payments`, **`POST /sales/orders/:id/complete`** (the
auto-deduction step), `GET /sales/orders`, `GET /sales/orders/:id`.

## End-to-end smoke test
1. Create ingredient products (e.g. `BUN`, `PATTY`, `CHEESE`) and load stock via the
   existing opening-stock import.
2. Create a sellable product `Chicken Burger`, then:
   ```json
   POST /recipes
   { "productId": <burgerId>, "name": "Chicken Burger v1", "yieldQty": 1,
     "components": [
       { "componentProductId": <bunId>,    "quantity": 1 },
       { "componentProductId": <pattyId>,  "quantity": 1 },
       { "componentProductId": <cheeseId>, "quantity": 1 }
     ] }
   ```
3. `POST /sales/orders` with one line `{ productId: burgerId, quantity: 2, unitPrice: 25 }`.
4. `POST /sales/orders/:id/payments` `{ method: "CASH", amount: 50 }`.
5. `POST /sales/orders/:id/complete`.
6. Verify: `inventory_transactions` has a `SALE` row per ingredient (qty 2 each),
   branch stock dropped FEFO (earliest expiry first), and the order shows
   `foodCost` + `grossProfit`. Loyalty points accrue if a customer was attached.

## Costing notes (v1)
- `unitPrice` is supplied per line by the POS (the existing catalog stores cost, not a
  menu/sell price — a dedicated menu-pricing layer is Increment 5).
- Food cost uses each ingredient's `Product.costPrice` × deducted qty. A future pass can
  switch to true consumed-batch cost (weighted by the FEFO allocation) for exact COGS.
- Recipe loss factors (`prepLossPct`, `cookingLossPct`, `wastePct`, per-line `wastePct`)
  inflate the deducted quantity so theoretical usage matches real kitchen yield.

See `ANALYSIS_AND_ROADMAP.md` for the full audit and the remaining increments
(Production, Finance journal, POS/KDS UI, sales dashboards, printing).
