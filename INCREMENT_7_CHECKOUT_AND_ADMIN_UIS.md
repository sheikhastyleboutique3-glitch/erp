# Increment 7 — Coupon/Gift-Card Checkout + Production/Tables/Promotions Admin UIs

Builds on Increments 1-6. **Verified:** backend `tsc --noEmit` = 0 errors; frontend
`tsc` = 0 errors and `vite build` = `✓ built`.

## 1) Coupons & gift cards wired into POS checkout
**Backend (`sales` module + schema):**
- `Order` gained `couponCode` + `couponDiscount` (additive migration `20260624_order_coupon_fields`).
- `POST /sales/orders` now accepts `couponCode`. The coupon is validated against the gross
  subtotal at create time; the granted discount is stored in `couponDiscount` and folded into
  `discountTotal` / `total`. `recompute()` preserves the coupon discount when items change.
- `POST /sales/orders/:id/payments` accepts `method: GIFT_CARD` + `giftCardCode`; the amount is
  drawn down from the gift-card balance (`promotions.redeemGiftCard`) before the payment row is
  written. Insufficient balance / inactive / expired cards are rejected.
- On `complete`, the coupon's `redeemedCount` is incremented **post-commit** so a redemption-cap
  race can never roll back an already-paid sale.
- Finance `SALE_REVENUE` is net of the coupon discount (revenue = subtotal − discountTotal).

**Frontend (`POSPage`):** coupon code field with **Apply** (live `/coupons/:code/validate`
preview), a subtotal → −coupon → total breakdown, and a payment-method switch
(**Cash / Card / Gift Card**); gift-card tender prompts for the card code.

## 2) New admin UIs
- **Production** (`/production`) — create a run (product + planned qty + optional expiry),
  then **Start / Complete / Cancel**. Complete consumes ingredients and yields the product
  through the FEFO engine. Table view shows planned/produced/cost/status.
- **Tables & Reservations** (`/tables`) — tabbed: add tables + change status
  (Available/Occupied/Reserved); book reservations and move them through
  Booked → Seated → Completed/Cancelled/No-show (table status auto-syncs).
- **Promotions** (`/promotions`) — tabbed: issue & list **gift cards** (balance tracking) and
  create & list **coupons** (percent or fixed, min order, redemption counts).
- Routes added to `App.tsx`; nav entries + EN/AR labels added (`production`, `tables`, `promotions`).

## Apply
```bash
cd backend && npm install && npx prisma migrate deploy && npx prisma generate && npm run start:dev
cd ../frontend && npm install && npm run build   # or npm run dev
```
Run migrations in order: `20260624_restaurant_pos_recipes` →
`20260624_restaurant_production_finance_pos` → `20260624_order_coupon_fields`.

## Honest status
- All code type-checks and the frontend bundles; **not** executed against a live Postgres here.
  Smoke-test: issue a coupon + a gift card in Promotions, then in POS apply the coupon and pay
  with the gift card, complete the sale, and confirm the discount, the drawn-down gift-card
  balance, the coupon `redeemedCount`, and the net `SALE_REVENUE` finance entry.
- Split tender (part gift card / part cash) isn't exposed in the POS UI yet — the payments
  endpoint already supports multiple payments per order, so it's a UI-only addition.
- The full ERP now spans: supply chain (original) + Recipes/BOM, POS sales with auto
  FEFO deduction, Production, Finance journal, KDS, Sales analytics, Tables/Reservations,
  Promotions, and auto-reorder — with POS, KDS, Sales Dashboard, Production, Tables, and
  Promotions front-end screens.
