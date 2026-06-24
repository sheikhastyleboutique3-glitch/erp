# 🍽️ ERP V8 — Enterprise F&B Operations System

An internal supply-chain, kitchen-requisition, and inventory platform for multi-branch
Food & Beverage businesses. Procurement, central warehouse, restaurant branches, and kitchen teams
all work in one system — with **batch tracking, FEFO (First-Expired-First-Out), branch transfers,
purchase orders, wastage, alerts, and reporting**.

- **Backend:** NestJS (Node 20) + Prisma + PostgreSQL
- **Frontend:** React + Vite + TailwindCSS (bilingual EN/AR, RTL)
- **Auth:** JWT (15-min access + 7-day refresh), 9-role RBAC
- **Runs on:** Windows (development), Docker (recommended for servers), or bare-metal Linux

---

## 📋 Table of Contents

1. [What you can do](#-what-you-can-do)
2. [Roles & guidelines](#-roles--guidelines)
3. [Requirements](#-requirements)
4. [🪟 Setup on Windows (development) — step by step](#-setup-on-windows-development--step-by-step)
5. [🐳 Setup with Docker (servers — recommended)](#-setup-with-docker-servers--recommended)
6. [🐧 Setup on bare-metal Linux (PM2 + Nginx)](#-setup-on-bare-metal-linux-pm2--nginx)
7. [Database: schema, `db push`, and the batch hotfix](#-database-schema-db-push-and-the-batch-hotfix)
8. [Environment variables](#-environment-variables)
9. [Demo data & login accounts](#-demo-data--login-accounts)
10. [Guided demo walkthrough](#-guided-demo-walkthrough)
11. [Key workflows explained](#-key-workflows-explained)
12. [System Reset (Admin)](#-system-reset-admin)
13. [Everyday commands](#-everyday-commands)
14. [Troubleshooting](#-troubleshooting)
15. [Project structure](#-project-structure)
16. [Changelog / fixes applied](#-changelog--fixes-applied)

---

## ✨ What you can do

| Module | Summary |
|---|---|
| **Requisitions** | Kitchens request stock through a full approval chain: Draft → Submitted → Manager Approved/Modified → Order Placed → Received at Warehouse → Dispatched → Confirmed Receipt. |
| **Purchase Orders** | Create POs (from a requisition or ad-hoc), send to suppliers, and **receive goods** with real qty, real price, and **per-batch expiry** captured at goods-receipt. Price differences are logged to supplier price history. |
| **Inventory** | Per-branch stock with **batch tracking + FEFO**. The list shows **one row per product** with a batch count; click it to see every batch (qty, manufacture date, expiry, days left). |
| **Adjust Stock** | One simple action: **Stock In** (adds / creates a batch on expiry-tracked items), **Stock Out** (auto-consumes the oldest-expiry batch first — no manual batch picking), or **Set exact count**. |
| **Branch Transfers** | Move stock between branches. FEFO auto-selects oldest-expiry batches; an inline preview shows what will move. Dispatch → In-Transit → Approve & Receive (expiry retained), with cancel-and-return. |
| **Wastage** | Record wastage with a reason; stock is deducted FEFO. |
| **Alerts & Reports** | Low-stock, near-expiry, wastage thresholds; financial / high-consumption / PO-stats reports; CSV export. |
| **Admin** | System stats, FK-safe record deletion, and a guarded **System Reset**. |
| **Extras** | Branch cash float, multi-branch assignments, audit log, notification config, drivers, invoice customization. |

---

## 👥 Roles & guidelines

The system has **9 roles**. Each user is scoped to one or more branches.

| Role | Typical user | Can do | Guidelines |
|---|---|---|---|
| **SUPER_ADMIN** | Owner / IT | Everything across all branches; Admin Panel; System Reset | Use sparingly for day-to-day ops; keep this account's password secret. |
| **BRANCH_MANAGER** | Branch lead | Approve/modify requisitions, view branch inventory & reports | Approve requisitions promptly; review near-expiry and low-stock tabs daily. |
| **PROCUREMENT** | Buyer | Advance approved requisitions, create & send POs | Confirm supplier prices on PO receipt so price history stays accurate. |
| **WAREHOUSE** | Warehouse staff | Receive POs (capture batch/expiry), dispatch to branches, run transfers | Always enter manufacture/expiry on receipt for tracked items so FEFO works. |
| **KITCHEN** | Chefs | Submit requisitions, confirm receipt, record wastage | Submit requisitions early; confirm receipt so stock lands at the branch. |
| **BARISTA** | Coffee bar | Submit requisitions, record wastage (beverages) | — |
| **PASTRY** | Pastry team | Submit requisitions, record wastage (pastry) | Watch dairy/butter expiry — these are batch-tracked. |
| **CASHIER** | Front of house | View assigned data, limited entry | — |
| **CLEANER** | Cleaning staff | Record usage/wastage of cleaning supplies; view assigned branch stock | Log cleaning-supply consumption so stock and reorder points stay correct. |

> Every demo account uses the password **`Admin@1234`** — see the [accounts table](#-demo-data--login-accounts).

---

## ✅ Requirements

**Windows (development):**
- [Node.js 20 LTS](https://nodejs.org) (includes npm)
- One database option:
  - **Docker Desktop** for Windows (easiest — runs Postgres in a container), **or**
  - **PostgreSQL 15** for Windows (native install)
- [Git for Windows](https://git-scm.com) (optional but recommended)

**Servers:** Docker + Docker Compose (recommended), or Node 20 + PostgreSQL 15 + Nginx for bare-metal.

---

## 🪟 Setup on Windows (development) — step by step

These steps use **PowerShell**. They assume the project is unzipped at, e.g.,
`C:\Users\you\Desktop\erp_project`.

### Option A — Postgres via Docker Desktop (recommended, least hassle)

```powershell
# 1) Start ONLY a Postgres container (Docker Desktop must be running)
docker run --name erp-postgres -e POSTGRES_USER=erp_user -e POSTGRES_PASSWORD=erp_password `
  -e POSTGRES_DB=gwk_v7 -p 5432:5432 -d postgres:15-alpine

# 2) Backend
cd C:\Users\you\Desktop\erp_project\backend
Copy-Item .env.example .env          # then edit .env (see below)
npm install
npx prisma generate
npx prisma db push                   # create all tables from schema.prisma
npm run prisma:seed                  # load demo data
npm run start:dev                    # API on http://localhost:3000  (Swagger: /api/docs)

# 3) Frontend (open a SECOND PowerShell window)
cd C:\Users\you\Desktop\erp_project\frontend
npm install
npm run dev                          # Vite dev server, usually http://localhost:5173
```

Your `backend\.env` for Windows local dev:
```env
DATABASE_URL=postgresql://erp_user:erp_password@localhost:5432/gwk_v7
JWT_SECRET=dev_secret_change_me_min_32_chars_long
JWT_REFRESH_SECRET=dev_refresh_secret_change_me_min_32_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
```

> **Vite → API proxy:** in development the SPA calls `/api`. Make sure `frontend/vite.config.ts`
> proxies `/api` and `/uploads` to `http://localhost:3000` (the project ships this). If you changed
> the backend port, update the proxy to match.

### Option B — native PostgreSQL for Windows (no Docker)

1. Install **PostgreSQL 15** (the installer includes pgAdmin). Remember the `postgres` superuser password.
2. Create the database & user (in **SQL Shell (psql)** or pgAdmin):
   ```sql
   CREATE USER erp_user WITH PASSWORD 'erp_password';
   CREATE DATABASE gwk_v7 OWNER erp_user;
   ```
3. Use the same `backend\.env` as Option A, then run the same backend/frontend steps
   (`npm install` → `npx prisma generate` → `npx prisma db push` → `npm run prisma:seed` →
   `npm run start:dev`).

### Windows gotchas

| Problem | Fix |
|---|---|
| `npm install` fails building **bcrypt** | Install build tools once: `npm install --global windows-build-tools` (older Node) **or** ensure "Desktop development with C++" is installed via Visual Studio Build Tools. Re-run `npm install`. |
| `prisma db push` can't connect | Postgres isn't running or the port is wrong. For Docker: `docker ps` should show `erp-postgres`. For native: check the **postgresql-x64-15** service is running. |
| Port 3000 or 5173 already in use | Close the other process or change `PORT` / Vite port. |
| Line-ending / script warnings | Harmless on Windows; Prisma and Node run fine. |
| `prisma migrate deploy` does nothing | Expected — this project is schema-first. Use **`npx prisma db push`**. |

> When you're done developing, stop the DB container with `docker stop erp-postgres`
> (and `docker start erp-postgres` next time).

---

## 🐳 Setup with Docker (servers — recommended)

```bash
unzip -o erp-fixed.zip && cd erp_project

cp .env.example .env
#  set JWT_SECRET / JWT_REFRESH_SECRET  (openssl rand -hex 32)
#  set ALLOWED_ORIGINS=http://<your-server-ip-or-domain>   (no trailing slash)

docker compose up -d --build          # postgres + backend + frontend
docker compose exec backend npx prisma db push   # create schema (NOT automatic)
docker compose exec backend npm run prisma:seed  # demo data (first install only)
```

Open **http://&lt;your-server-ip&gt;** → log in as `admin@gwk.com` / `Admin@1234`.
Only **port 80** is exposed; the backend and Postgres stay on the internal Docker network.

> ⚠️ Migrations/seed do **not** run on container start. Run `prisma db push` after every deploy
> where the schema changed, and `prisma:seed` only on first install (it rewrites demo data).

---

## 🐧 Setup on bare-metal Linux (PM2 + Nginx)

```bash
apt update && apt install -y curl git nginx postgresql openssl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm i -g pm2

sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD 'erp_password';"
sudo -u postgres psql -c "CREATE DATABASE gwk_v7 OWNER erp_user;"

cd erp_project/backend
cp .env.example .env            # DATABASE_URL host = localhost; set JWT + ALLOWED_ORIGINS
npm install && npx prisma generate && npx prisma db push && npm run prisma:seed
npm run build
pm2 start dist/main.js --name erp-backend && pm2 save && pm2 startup

cd ../frontend
npm install && npm run build
cp -r dist/* /var/www/erp/      # serve via Nginx, proxy /api + /uploads → 127.0.0.1:3000
```

---

## 🗄️ Database: schema, `db push`, and the batch hotfix

This project is **schema-first**: `backend/prisma/schema.prisma` is the source of truth and
`npx prisma db push` makes the database match it. **For any fresh install, use `db push`** — it
creates every table and column (including batch tracking) correctly.

`backend/prisma/migrations/` and the root `HOTFIX_inventory_manufactureDate.sql` exist **only** to
upgrade an **already-populated** DB to batch tracking:

| File | Purpose |
|---|---|
| `migrations/20260623_batch_tracking_and_transfers/migration.sql` | Adds batches, transfer orders, product expiry config, branch cash float, and inventory batch columns. Idempotent. |
| `migrations/20260623150000_fix_inventory_batch_columns/migration.sql` | Guarantees `inventory.manufactureDate / expiryDate / batchNumber` exist (the original migration omitted `manufactureDate`). |
| `HOTFIX_inventory_manufactureDate.sql` | Same fix as a single script: `psql "$DATABASE_URL" -f HOTFIX_inventory_manufactureDate.sql`. |

> Seeing `The column inventory.manufactureDate does not exist`? Your DB came from the old SQL
> migration. Run **`npx prisma db push`** (or the hotfix), then restart the backend.

After seeding (which inserts explicit ids), realign Postgres sequences with `npm run db:resync`
(the seed already does this automatically).

---

## 🔧 Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection (`localhost` for Windows/bare-metal, `postgres` inside Docker) |
| `JWT_SECRET` | ✅ | weak fallback | Access-token signing key — set explicitly (`openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | ✅ | weak fallback | Refresh-token signing key — set explicitly |
| `JWT_EXPIRES_IN` | ❌ | `15m` | Access-token lifetime (raise it to reduce "Token expired" logouts) |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | `7d` | Refresh-token lifetime |
| `PORT` | ❌ | `3000` | Backend HTTP port |
| `NODE_ENV` | ❌ | `production` | `production` = strict CORS + Helmet + Swagger off; use `development` locally |
| `ALLOWED_ORIGINS` | ✅ (prod) | — | Comma-separated CORS allow-list (exact origin, **no trailing slash**) |

> In Docker these come from the **root `.env`** (the container does not read `backend/.env`).
> WhatsApp/SMTP credentials are set in-app via **Admin → Notifications**, not env vars.

---

## 🎯 Demo data & login accounts

> All accounts use the password **`Admin@1234`** — change it after first login.

| Email | Role | Branch | Language |
|---|---|---|---|
| `admin@gwk.com` | 🛡️ Super Admin | All branches | English |
| `manager.d@gwk.com` | 👔 Branch Manager | Doha (West Bay) | Arabic |
| `manager.w@gwk.com` | 👔 Branch Manager | Al Wakra | Arabic |
| `procurement@gwk.com` | 📦 Procurement | Central Warehouse | English |
| `warehouse@gwk.com` | 🏭 Warehouse | Central Warehouse | Arabic |
| `kitchen@gwk.com` | 🍳 Kitchen | Doha | Arabic |
| `barista@gwk.com` | ☕ Barista | Doha | English |
| `pastry@gwk.com` | 🥐 Pastry | Doha | Arabic |
| `cashier@gwk.com` | 💳 Cashier | Doha | English |
| **`cleaner@gwk.com`** | 🧽 **Cleaner** | Doha | Arabic |
| `kitchen.w@gwk.com` | 🍳 Kitchen | Al Wakra | Arabic |

**The demo seed loads:**
- 3 branches (1 warehouse + 2 restaurants), each with a **cash float**
- 4 units, 8 categories, 4 suppliers
- 20 products — **7 expiry-tracked** (whole milk, fresh cream, eggs, oat milk, unsalted butter, lemons, mint)
- 11 users covering all 9 roles (including the **Cleaner**)
- Inventory across all branches **with multi-batch FEFO stock** — e.g. Whole Milk @ Warehouse and
  Oat Milk @ Doha each hold several batches with different expiries
- 12 requisitions (every workflow status), 8 purchase orders, supplier price history
- 10 wastage records, 6 alerts, settings, notification config, 3 drivers

---

## 🔄 Guided demo walkthrough

1. **Requisition → fulfilment:** `kitchen@gwk.com` submits a requisition → `manager.d@gwk.com`
   approves → `procurement@gwk.com` places the order / creates a PO → `warehouse@gwk.com` receives
   & dispatches → `kitchen@gwk.com` confirms receipt.
2. **Receive a PO with batches:** open a PO → **Receive** → enter received qty, unit price, and (for
   expiry-tracked items) the manufacture/expiry date → a batch is created at goods-receipt.
3. **Grouped inventory:** Inventory → **All Inventory**. Whole Milk (Warehouse) and Oat Milk (Doha)
   show a **batch count** — click the row to open the batch breakdown (earliest expiry first).
4. **FEFO stock-out:** Inventory → **Adjust Stock** → **Stock Out** a tracked item. The oldest-expiry
   batch is consumed first automatically — no manual batch picking.
5. **Branch transfer:** Branch Transfers → **New Transfer** (Warehouse → Doha) → tab out of the Qty
   field to preview the FEFO batches that will move → **Dispatch** → **Approve & Receive**.
6. **Cleaner role:** `cleaner@gwk.com` → record consumption/wastage of cleaning supplies for the Doha branch.
7. **Admin:** `admin@gwk.com` → Admin Panel → system stats, invoice customization, and (carefully) System Reset.

---

## 🧭 Key workflows explained

**Expiry tracking (per product)**
- `tracksExpiry = false` → a single aggregate stock row, no batches.
- `tracksExpiry = true` with `expiryTrackingType`:
  - `SHELF_LIFE_DAYS` → expiry = receipt date + the product's shelf-life days.
  - `MANUFACTURE_TO_EXPIRY` → expiry is entered per batch at goods-receipt.

**FEFO (First-Expired-First-Out)**
- Any stock removal (stock-out, wastage, transfer-out) consumes the **earliest-expiry batch first**,
  across batches, automatically. Undated stock is consumed last.

**Adjust Stock actions**
- **Stock In** — adds quantity. On an expiry-tracked product it creates a new batch (or appends to a
  matching batch number) using the manufacture/expiry you enter.
- **Stock Out** — removes quantity via FEFO. No batch picking.
- **Set exact count** — sets the on-hand quantity to an exact number.

---

## ♻️ System Reset (Admin)

`POST /api/admin/reset` (SUPER_ADMIN only) wipes operational data and realigns id sequences.

- **Confirmation phrase (required):** `PURGE-ALL-OPERATIONAL-DATA-TO-ZERO`
- **`keepMasterData: true`** → *Transaction wipe*: clears requisitions, POs, inventory, **batches,
  transfer orders**, wastage, alerts, audit logs, price history; keeps products/categories/units/
  suppliers/users.
- **`keepMasterData: false`** → *Full wipe*: also deletes master data (Super Admin accounts retained).

> Batches and transfer orders are purged **before** products, so a full wipe no longer fails on the
> `batches → products` foreign key.

---

## 🛠️ Everyday commands

```bash
# Docker
docker compose logs -f backend
docker compose up -d --build backend frontend
docker compose exec backend npx prisma db push        # after schema changes
docker compose down                                   # keep data
docker compose down -v                                # ⚠️ delete DB + uploads

# Backup / restore (Docker)
docker compose exec -T postgres pg_dump -U erp_user gwk_v7 > backup_$(date +%F).sql
cat backup.sql | docker compose exec -T postgres psql -U erp_user -d gwk_v7

# Local dev (Windows / bare-metal)
npm run start:dev      # backend (watch mode)
npm run prisma:seed    # reseed demo data (dev only!)
npm run db:resync      # realign id sequences
npm run dev            # frontend (Vite)
npm run build          # production build (backend: nest build, frontend: vite build)
```

---

## 🆘 Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `The column inventory.manufactureDate does not exist` (500 on inventory, reports, transfers, **PO receive**) | DB built from the old SQL migration. Run **`npx prisma db push`** or apply `HOTFIX_inventory_manufactureDate.sql`, then restart the backend. |
| **PO receive** → `400: … dateReceived/manufactureDate/expiryDate should not exist` | Old receive DTO didn't whitelist batch fields. Fixed — rebuild the backend. |
| Inventory shows the **same product on many rows** | Old per-batch listing. Fixed — list is grouped to one row per product; click to expand batches. |
| Stock-out: "insufficient stock" / wrong totals on a batched item | Old adjust hit the empty aggregate row. Fixed — stock-out now uses FEFO across batches. |
| `401: Token expired` in logs | Not a bug — JWT access token expired. Log out/in, or raise `JWT_EXPIRES_IN`. |
| `npm install` fails on **bcrypt** (Windows) | Install Visual Studio Build Tools ("Desktop development with C++"), then re-run `npm install`. |
| `prisma db push` can't reach the DB | Postgres not running / wrong host or port. Docker: `docker ps`. Native Windows: check the PostgreSQL service. |
| `prisma migrate deploy` does nothing | Schema-first project — use `npx prisma db push`. |
| Login fails / CORS error | `ALLOWED_ORIGINS` must exactly match the browser URL (no trailing slash/path). Fix `.env`, then restart the backend. |
| Frontend warns "chunks larger than 500 kB" | Advisory only; build still succeeds. Optionally raise `build.chunkSizeWarningLimit` in `vite.config.ts`. |
| Build killed / OOM on a small VPS | Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. |
| Old branding after editing the SPA | Bundle cached — rebuild frontend, force-recreate, hard-refresh (Ctrl+Shift+R). |

---

## 📁 Project structure

```
erp_project/
├─ docker-compose.yml                      # postgres + backend + frontend
├─ .env / .env.example                     # root env (Docker Compose)
├─ HOTFIX_inventory_manufactureDate.sql    # one-shot DB hotfix
├─ backend/                                # NestJS API
│  ├─ Dockerfile
│  ├─ prisma/
│  │  ├─ schema.prisma                     # DB source of truth
│  │  ├─ seed.ts                           # full demo dataset (FEFO batches, all roles)
│  │  ├─ resync-sequences.ts               # realign id sequences
│  │  └─ migrations/                       # SQL for upgrading an EXISTING populated DB
│  └─ src/modules/                         # auth, inventory, transfers, purchase-orders,
│                                          # requisitions, wastage, reports, admin, …
└─ frontend/                               # React + Vite SPA
   ├─ Dockerfile / nginx.conf
   └─ src/{pages,components,lib,i18n,contexts}
```

---

## 🔄 Changelog / fixes applied

**Batch tracking & inventory UX**
- Fixed missing `inventory.manufactureDate` (+ `expiryDate`, `batchNumber`) — cleared 500s on
  inventory, reports, transfers, and PO receive.
- PO receive DTO now whitelists `dateReceived` / `manufactureDate` / `expiryDate` (fixes the 400).
- **Grouped inventory** (`GET /inventory/grouped`): one row per product+branch with a batch count;
  click for a batch-breakdown popup.
- **Batch-aware Adjust Stock**: Stock In / Stock Out / Set exact count; FEFO on removals; auto-batch
  on expiry-tracked receipts; no manual batch picking. Wastage uses the same FEFO path.
- **Easier transfers**: FEFO preview runs automatically when you leave the Qty field.

**Reset, resync & demo**
- System Reset now purges `batches` / `transfer_orders` / `transfer_order_items` (FK-safe) and resets
  their sequences; full wipe no longer fails on the batches→products FK. Admin stats include
  transfer/batch counts.
- `resync-sequences` includes the new tables.
- Demo seed: perishables flagged expiry-tracked, **multi-batch FEFO stock**, branch **cash float**,
  the **Cleaner** account documented, and the inventory upsert fixed to the post-migration
  `(productId, branchId, batchId)` key.

**Earlier deployment fixes (retained)**
- Node-based backend healthcheck; Postgres host port removed; correct `dist/main.js` build path;
  Prisma OpenSSL-3 engine on Alpine; ts-node seed loader + `tsconfig` in the runtime image; aligned
  DB credentials & `ALLOWED_ORIGINS`; safe login placeholders; `.dockerignore`; compose hygiene.
