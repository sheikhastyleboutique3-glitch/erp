# 🍽️ GWK — Enterprise Restaurant ERP & F&B Operations System

A full multi-branch **Restaurant ERP**: front-of-house **POS, waiter floor plans, kitchen
displays and deliveries** on top of a robust back-of-house **supply chain** (procurement,
central warehouse, branch requisitions, **batch tracking + FEFO** inventory, recipes/BOM,
production, finance journal and reporting). Bilingual **EN/AR** throughout.

- **Backend:** NestJS (Node 20) + Prisma + PostgreSQL + socket.io (real-time KDS)
- **Frontend:** React + Vite + TailwindCSS (bilingual EN/AR, RTL, light/dark)
- **Auth:** JWT (15-min access + 7-day refresh), role-based access control (11 roles)
- **Runs on:** Windows (development), Docker (recommended for servers), or bare-metal Linux

---

## 📋 Table of Contents

1. [What you can do](#-what-you-can-do)
2. [Roles & guidelines](#-roles--guidelines)
3. [Requirements](#-requirements)
4. [🪟 Setup on Windows (development)](#-setup-on-windows-development--step-by-step)
5. [🐳 Setup with Docker (servers — recommended)](#-setup-with-docker-servers--recommended)
6. [🐧 Setup on bare-metal Linux (PM2 + Nginx)](#-setup-on-bare-metal-linux-pm2--nginx)
7. [Database & migrations](#-database--migrations)
8. [Environment variables](#-environment-variables)
9. [Demo data & login accounts](#-demo-data--login-accounts)
10. [Key workflows explained](#-key-workflows-explained)
11. [Printing (thermal / KOT / Z-report)](#-printing-thermal--kot--z-report)
12. [System Reset (Admin)](#-system-reset-admin)
13. [Everyday commands](#-everyday-commands)
14. [Troubleshooting](#-troubleshooting)
15. [Project structure](#-project-structure)
16. [Changelog](#-changelog)

---

## ✨ What you can do

### Front of house (restaurant)
| Module | Summary |
|---|---|
| **POS / Checkout** | Product grid, cart, coupons, and **split tender** (Cash / Card / Gift Card / **Store Credit** / **Loyalty points**) with change due. Attach a customer, apply discounts, **auto-print the thermal receipt**, and **refund** completed sales (restocks stock + reverses finance). |
| **POS Sessions & cash control** | Open a shift with a cash float, record **cash in/out**, print an **X-report** any time, and **close** with a counted drawer → **Z-report** (sales by method, expected vs counted cash, COGS / gross profit). Selling requires an open session. |
| **Waiter floor plan** | Visual table grid colour-coded by status (Available / Occupied / **Bill Requested** / Reserved). Open or resume a table's ticket, punch items from a menu grid (images + **live stock**), choose **modifiers**, hold/park, **request bill**, and **send to kitchen** (prints per-station KOT). **Transfer / merge / split** tables. |
| **Kitchen Display (KDS)** | Real-time ticket board (**WebSocket** push, polling fallback) with Pending → Preparing → Ready → Served, modifiers and notes shown per station. |
| **Modifiers & combos** | Option groups (size, extras, "no onions") with price deltas and optional **automatic inventory deduction** of components. |
| **Deliveries / driver terminal** | Delivery orders create dispatch **manifests**; managers assign drivers; drivers progress **Assigned → Out for delivery → Delivered**. |
| **Customers / CRM** | Customer directory with **loyalty points** and **store-credit wallet** (top-up / grant), order history, redeemable at POS. |

### Menu, recipes & production
| Module | Summary |
|---|---|
| **Recipes & BOM** | Link a sellable product to its ingredients; when sold, the BOM is exploded and components are deducted from stock via **FEFO** (with food-cost & gross-profit snapshots on the order). |
| **Production orders** | Central-kitchen production consumes raw/semi components and yields finished/semi products through the inventory engine. |
| **Promotions** | Gift cards (balance draw-down) and coupons (percent / fixed, limits, validity). |
| **Sales orders / quotations** | B2B / catering: quotation → confirm → **fulfill** (realized as a sale so stock + COGS + finance all run). |

### Back of house (supply chain)
| Module | Summary |
|---|---|
| **Requisitions** | Branch → warehouse approval chain: Draft → Submitted → Manager Approved/Modified → Order Placed → Received → Dispatched → Confirmed Receipt. |
| **Purchase Orders** | Create/send POs and **receive goods** with real qty, price and **per-batch expiry**; price variance logged. |
| **Inventory** | Per-branch stock with **batch tracking + FEFO**; grouped one-row-per-product view with batch breakdown. |
| **Adjust Stock** | Stock In / Stock Out (FEFO) / Set exact count. |
| **Branch Transfers** | FEFO-based stock movement between branches with dispatch → in-transit → receive. |
| **Stocktake / count** | Snapshot system on-hand, enter a physical count, and review **variance + shrinkage value** (audit). |
| **Wastage** | Record wastage with a reason; stock deducted FEFO. |
| **Staff tasks** | Checklist/task assignment for Cleaners / Maintenance. |
| **Alerts & Reports** | Low-stock, near-expiry, wastage thresholds; sales / financial / consumption reports; CSV export. |
| **Finance** | Single journal of revenue, COGS, tax, service, tip, refunds — feeding the sales dashboard (gross profit, food-cost %). |
| **Admin** | System stats, FK-safe deletion, guarded System Reset, branding/theme, notifications. |

### Qatar localization & compliance
- Bilingual **EN/AR** (RTL), **Qatari 8-digit phone** validation, branch **CR / Baladiya license** fields and an admin **regulatory lock** that suspends operations on a non-compliant branch. Pricing in **QAR**.

---

## 👥 Roles & guidelines

The system has **11 roles**. Each user is scoped to one or more branches.

| Role | Typical user | Can do |
|---|---|---|
| **SUPER_ADMIN** | Owner / IT | Everything across all branches; Admin Panel; System Reset |
| **BRANCH_MANAGER** | Branch lead | Approve/modify requisitions, manage menu/tables/staff, view reports & dashboards |
| **PROCUREMENT** | Buyer | Advance approved requisitions, create & send POs, pricing |
| **WAREHOUSE** | Warehouse staff | Receive POs (batch/expiry), dispatch transfers, stocktake |
| **KITCHEN** | Chefs | KDS, production, recipes, requisitions, wastage |
| **BARISTA** | Coffee bar | KDS (bar), requisitions, wastage |
| **PASTRY** | Pastry team | KDS (pastry), recipes, requisitions, wastage |
| **CASHIER** | Front of house | POS, sessions/cash, tables, deliveries dispatch, customers |
| **WAITER** | Service | Waiter floor plan: punch orders, modifiers, hold, request bill, KOT |
| **DRIVER** | Fleet | Driver terminal: own delivery runs, status updates |
| **CLEANER** | Cleaning | Staff tasks/checklists; cleaning-supply usage |

> All demo accounts use the password **`Admin@1234`** — see the [accounts table](#-demo-data--login-accounts).

---

## ✅ Requirements

**Windows (development):** [Node.js 20 LTS](https://nodejs.org), plus **Docker Desktop** (easiest, runs Postgres) **or** native **PostgreSQL 15**. [Git](https://git-scm.com) recommended.

**Servers:** Docker + Docker Compose (recommended), or Node 20 + PostgreSQL 15 + Nginx for bare-metal.

---

## 🪟 Setup on Windows (development) — step by step

Using **PowerShell**, with the project at e.g. `C:\Users\you\Desktop\erp_project`.

### Postgres via Docker Desktop (recommended)
```powershell
# 1) Start a Postgres container (Docker Desktop must be running)
docker run --name erp-postgres -e POSTGRES_USER=erp_user -e POSTGRES_PASSWORD=erp_password `
  -e POSTGRES_DB=gwk_v7 -p 5432:5432 -d postgres:15-alpine

# 2) Backend
cd C:\Users\you\Desktop\erp_project\backend
Copy-Item .env.example .env          # then edit JWT secrets if you like
npm install
npx prisma generate
npx prisma migrate deploy            # apply the baseline migration (creates all tables)
npm run prisma:seed                  # load demo data
npm run start:dev                    # API on http://localhost:3000 (Swagger: /api/docs)

# 3) Frontend (second PowerShell window)
cd C:\Users\you\Desktop\erp_project\frontend
npm install
npm run dev                          # Vite dev server, usually http://localhost:5173
```

> **Fresh dev DB:** `npx prisma migrate reset` drops, applies the baseline, and seeds in one step.
> **Native PostgreSQL instead of Docker:** create the DB/user
> (`CREATE USER erp_user WITH PASSWORD 'erp_password';` / `CREATE DATABASE gwk_v7 OWNER erp_user;`),
> then run the same backend steps.

Your `backend\.env` (see `.env.example`):
```env
DATABASE_URL="postgresql://erp_user:erp_password@localhost:5432/gwk_v7?schema=public"
JWT_SECRET="dev_secret_change_me_min_32_chars_long"
JWT_REFRESH_SECRET="dev_refresh_secret_change_me_min_32_chars"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:5173"
```

---

## 🐳 Setup with Docker (servers — recommended)

```bash
cd erp_project
cp .env.example .env
#  set JWT_SECRET / JWT_REFRESH_SECRET  (openssl rand -hex 32)
#  set ALLOWED_ORIGINS=http://<your-server-ip-or-domain>   (no trailing slash)

docker compose up -d --build          # postgres + backend + frontend
docker compose exec backend npm run prisma:seed   # demo data (first install only)
```

The backend container **automatically runs `prisma migrate deploy` on startup** (its `CMD` is
`npm run start:migrate`), so schema changes apply on every deploy with no manual step. Only **port
80** is exposed; backend and Postgres stay on the internal network. Real-time KDS uses
`/socket.io` (proxied by Nginx with WebSocket upgrade).

> Run `prisma:seed` only on first install (it rewrites demo data).

---

## 🐧 Setup on bare-metal Linux (PM2 + Nginx)

```bash
apt update && apt install -y curl git nginx postgresql openssl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm i -g pm2

sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD 'erp_password';"
sudo -u postgres psql -c "CREATE DATABASE gwk_v7 OWNER erp_user;"

cd erp_project/backend
cp .env.example .env            # localhost DATABASE_URL; set JWT + ALLOWED_ORIGINS
npm install && npx prisma generate && npx prisma migrate deploy && npm run prisma:seed
npm run build
pm2 start dist/main.js --name erp-backend && pm2 save && pm2 startup

cd ../frontend
npm install && npm run build
cp -r dist/* /var/www/erp/      # serve via Nginx; proxy /api, /uploads, /socket.io → 127.0.0.1:3000
```

---

## 🗄️ Database & migrations

`backend/prisma/schema.prisma` is the source of truth. The project uses a **single clean baseline
migration** (`backend/prisma/migrations/20260101000000_init`) that creates the entire schema, so:

- **Fresh database:** `npx prisma migrate deploy` (or `npx prisma migrate reset` for dev — drops,
  re-applies, reseeds). Docker does `migrate deploy` automatically on container start.
- **Quick local schema sync (no history):** `npx prisma db push` also works.

### Upgrading a database that was built with `db push` (no migration history)
If a DB already has the schema (e.g. an older install created via `db push`), tell Prisma the
baseline is already applied — **once** — so future `migrate deploy` runs cleanly:
```bash
npx prisma migrate resolve --applied 20260101000000_init
```

> Hit **P3009 / "migration failed"** from an older checkout? That was a pre-baseline issue (the old
> migrations assumed tables already existed). Pull the latest code (single baseline) and run
> `npx prisma migrate reset` on a dev DB, or `migrate resolve --applied` on a populated one.

After seeding (which inserts explicit ids), `npm run db:resync` realigns Postgres sequences (the
seed already does this automatically).

---

## 🔧 Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection (`localhost` for Windows/bare-metal, `postgres` inside Docker) |
| `JWT_SECRET` | ✅ | weak fallback | Access-token key — set explicitly (`openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | ✅ | weak fallback | Refresh-token key — set explicitly |
| `JWT_EXPIRES_IN` | ❌ | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | `7d` | Refresh-token lifetime |
| `PORT` | ❌ | `3000` | Backend HTTP port |
| `NODE_ENV` | ❌ | `production` | `production` = strict CORS + Helmet + Swagger off; use `development` locally |
| `ALLOWED_ORIGINS` | ✅ (prod) | — | Comma-separated CORS allow-list (exact origin, **no trailing slash**) |

> In Docker these come from the **root `.env`** (the backend container does not read `backend/.env`).
> Receipt business name/logo and notification credentials are set in-app via **Admin → Settings / Notifications**.

---

## 🎯 Demo data & login accounts

> All accounts use the password **`Admin@1234`** — change it after first login.

| Email | Role | Branch |
|---|---|---|
| `admin@gwk.com` | 🛡️ Super Admin | All branches |
| `manager.d@gwk.com` | 👔 Branch Manager | Doha (West Bay) |
| `manager.w@gwk.com` | 👔 Branch Manager | Al Wakra |
| `procurement@gwk.com` | 📦 Procurement | Central Warehouse |
| `warehouse@gwk.com` | 🏭 Warehouse | Central Warehouse |
| `kitchen@gwk.com` | 🍳 Kitchen | Doha |
| `barista@gwk.com` | ☕ Barista | Doha |
| `pastry@gwk.com` | 🥐 Pastry | Doha |
| `cashier@gwk.com` | 💳 Cashier | Doha |
| `waiter@gwk.com` | 🧑‍🍳 Waiter | Doha |
| `cleaner@gwk.com` | 🧽 Cleaner | Doha |
| `kitchen.w@gwk.com` | 🍳 Kitchen | Al Wakra |

The seed loads branches (warehouse + restaurants with cash float), units, categories, suppliers,
~20 products (several expiry-tracked), users across all roles, multi-batch FEFO inventory,
requisitions in every status, purchase orders, wastage, alerts, settings and drivers.

---

## 🧭 Key workflows explained

**Front-of-house sale (FEFO + costing).** A waiter/cashier rings items (with modifiers) → on
completion the order's recipes are exploded and components deducted **oldest-expiry-first**; the
order stores a **food-cost & gross-profit snapshot**; finance gets revenue + COGS lines; the table
frees and the KDS/floor update in real time.

**Waiter → cashier handoff.** Waiter opens a table, punches items, **requests bill** (table →
*Bill Requested*). The cashier sees it under **Pending bills** in POS, settles with split tender,
and the table returns to *Available*.

**Expiry tracking & FEFO.** Products can be `tracksExpiry` with `SHELF_LIFE_DAYS` or
`MANUFACTURE_TO_EXPIRY`. Every stock removal (sale, wastage, transfer-out, production) consumes the
earliest-expiry batch first, automatically.

**Refund.** A completed sale can be refunded (manager): stock is restocked (`RETURN_IN`), finance
entries reversed, loyalty rolled back, order marked `REFUNDED`.

---

## 🖨️ Printing (thermal / KOT / Z-report)

Printing renders an **80mm** layout into a hidden iframe and opens the OS print dialog, so any
thermal printer installed on the machine produces a real ticket (swap in a silent ESC/POS agent
later without layout changes):
- **Customer receipt** — logo + business info (from Settings), items, modifiers, split payments, change. Auto-prints on payment.
- **KOT (Kitchen Order Ticket)** — large text, **split per station** (Hot Kitchen / Pastry / Bar) with page breaks; "Send to kitchen" prints only newly added lines.
- **X / Z report** — mid-shift and session-close summaries from POS Sessions.

---

## ♻️ System Reset (Admin)

`POST /api/admin/reset` (SUPER_ADMIN only) wipes operational data and realigns id sequences.
- **Confirmation phrase:** `PURGE-ALL-OPERATIONAL-DATA-TO-ZERO`
- **`keepMasterData: true`** → clears transactions (requisitions, POs, inventory, batches, transfers, orders, wastage, alerts, audit); keeps products/categories/units/suppliers/users.
- **`keepMasterData: false`** → also deletes master data (Super Admin accounts retained).

---

## 🛠️ Everyday commands

```bash
# Docker
docker compose logs -f backend
docker compose up -d --build backend frontend
docker compose exec backend npx prisma migrate deploy   # (also runs automatically on start)
docker compose down                                      # keep data
docker compose down -v                                   # ⚠️ delete DB + uploads

# Backup / restore (Docker)
docker compose exec -T postgres pg_dump -U erp_user gwk_v7 > backup_$(date +%F).sql
cat backup.sql | docker compose exec -T postgres psql -U erp_user -d gwk_v7

# Local dev
npm run start:dev          # backend (watch)
npx prisma migrate deploy  # apply migrations
npx prisma migrate reset   # dev: drop + re-apply baseline + seed
npm run prisma:seed        # reseed demo data (dev only!)
npm run dev                # frontend (Vite)
npm run build              # production build (backend: nest build, frontend: vite build)
```

---

## 🆘 Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| **P3009 / "migration failed"** on a fresh DB | Old pre-baseline checkout. Pull the latest code (single baseline migration) and run `npx prisma migrate reset` (dev) or `npx prisma migrate deploy`. |
| `migrate deploy` rejected on a DB built via `db push` | Baseline tables already exist — run `npx prisma migrate resolve --applied 20260101000000_init` once, then deploy. |
| `prisma` not recognized | It's a local dependency — use `npx prisma …` (or the npm scripts). |
| KDS not updating live | WebSocket couldn't connect — it falls back to polling. Ensure Nginx proxies `/socket.io` (the shipped config does). |
| `401: Token expired` | JWT access token expired — log out/in, or raise `JWT_EXPIRES_IN`. |
| `npm install` fails on **bcrypt** (Windows) | Install Visual Studio Build Tools ("Desktop development with C++"), then re-run. |
| Login fails / CORS error | `ALLOWED_ORIGINS` must exactly match the browser URL (no trailing slash/path); restart backend. |
| Build killed / OOM on a small VPS | Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. |

---

## 📁 Project structure

```
erp_project/
├─ docker-compose.yml                      # postgres + backend + frontend
├─ .env / .env.example                     # root env (Docker Compose)
├─ backend/                                # NestJS API
│  ├─ Dockerfile                           # runtime CMD = migrate deploy + start
│  ├─ .env.example
│  ├─ prisma/
│  │  ├─ schema.prisma                     # DB source of truth
│  │  ├─ migrations/20260101000000_init/   # single clean baseline
│  │  └─ seed.ts                           # demo dataset (FEFO batches, all roles)
│  └─ src/modules/                         # auth, users, branches, categories, units, products,
│                                          # inventory, transfers, purchase-orders, requisitions,
│                                          # suppliers, wastage, alerts, reports, admin, audit,
│                                          # recipes, sales, sales-quotes, pos-sessions, modifiers,
│                                          # kds, tables, promotions, production, finance,
│                                          # deliveries, customers, stock-counts, staff-tasks,
│                                          # drivers, notifications, settings, analytics
└─ frontend/                               # React + Vite SPA
   ├─ Dockerfile / nginx.conf              # proxies /api, /uploads, /socket.io
   └─ src/{pages,components,lib,i18n,contexts}
```

---

## 🔄 Changelog

**Restaurant front-of-house**
- POS with split tender (cash/card/gift card/store credit/loyalty), coupons, customer attach,
  pending-bill handoff, refunds, and auto thermal receipts.
- POS **sessions + cash control + X/Z reports**.
- **Waiter floor plan** (open/resume tickets, menu grid with live stock, modifiers, hold,
  request bill, send-to-kitchen KOT) with table **transfer / merge / split**.
- **Real-time KDS** over WebSockets (polling fallback); modifiers shown on receipt/KOT/KDS.
- **Modifiers / combos** with automatic component deduction.
- **Deliveries / driver terminal** with dispatch manifests.
- **Customers / CRM** with loyalty + store-credit wallet.
- **Sales orders / quotations** (B2B catering) fulfilled through the sale engine.

**Menu, inventory & finance**
- Recipes/BOM with FEFO sale deduction and food-cost/gross-profit snapshots.
- **Stocktake / count** variance audit; production orders; promotions (gift cards + coupons).
- Per-category KDS/KOT **station routing**; EventEmitter decoupling of post-sale side effects.

**Platform & compliance**
- Qatar **8-digit phone** validation; branch **CR / Baladiya** fields + regulatory lock.
- **WAITER** and **DRIVER** roles added (11 total); sidebar reorganized into app groups.

**Database**
- Replaced broken partial migrations with a **single clean baseline** so a fresh DB builds
  deterministically; Docker **auto-runs `migrate deploy`** on start; added `backend/.env.example`.

**Earlier (retained)**
- Batch tracking + FEFO, grouped inventory, batch-aware Adjust Stock, branch transfers, FK-safe
  System Reset, Prisma OpenSSL-3 engine on Alpine, hardened CORS/Helmet, healthchecks.
