# Real‑time Notifications Upgrade (sound + clickable popup, all events, all roles)

## What this fixes

Before, sounds/popups only fired when a **new** requisition / PO / alert row
appeared (the poller compared the highest id). Status changes on existing rows
(**approve / modify / cancel / order placed / received / dispatched / confirmed /
PO created / PO received**) produced **no sound and no popup**, and the popup
that did show for new requisitions was **not clickable**.

Now every one of those events:
- creates an in‑app notification for **every user who has permission** to be
  notified (SUPER_ADMIN, PROCUREMENT, WAREHOUSE, the relevant BRANCH_MANAGER, and
  the requisition creator),
- plays the per‑type sound,
- shows a **clickable popup** that displays the **reason** and **deep‑links**
  straight to the requisition / purchase order,
- also raises a **native OS notification** (visible even when the tab is in the
  background) where the browser allows it.

Works across **web, iOS Safari and Android Chrome** (responsive web app). Each
device can still mute locally with the bell icon, and the master / per‑channel /
volume settings in the Admin panel still apply.

## Backend changes

- **`prisma/schema.prisma`** — new `Notification` model (in‑app inbox) + relation
  on `User`.
- **`notifications.service.ts`** — `emit()` event dispatcher, role‑based
  `resolveRecipients()`, and inbox methods (`getInbox`, `getUnreadCount`,
  `markRead`, `markAllRead`).
- **`notifications.controller.ts`** — new endpoints:
  `GET /notifications/inbox`, `GET /notifications/unread-count`,
  `PATCH /notifications/read`, `PATCH /notifications/read-all`.
- **`requisitions.service.ts`** — emits on create, manager approve/modify/cancel,
  procurement order‑placed/received/dispatched, and confirm‑receipt.
- **`purchase-orders.service.ts`** — emits on PO create and status update/receive.
- Wired `NotificationsModule` into `RequisitionsModule` and `PurchaseOrdersModule`.

Event → recipient roles are configurable in one place: `EVENT_ROLES` in
`notifications.service.ts`.

## Frontend changes

- **`lib/useNotificationSounds.tsx`** (replaces the old `.ts`) — polls the inbox
  (every 15s) + alerts, plays sound, shows clickable popups, fires OS notifications.
- **`lib/webNotify.ts`** — native OS notification helper + permission request.
- **`components/Layout.tsx`** — unread‑count badge on the Notifications nav item.
- **`pages/NotificationsPage.tsx`** — new **Inbox** tab (history, click to open,
  mark‑as‑read, mark‑all‑read) alongside the existing preferences/config tabs.

## Deploy steps

From `backend/`:

```bash
# 1. Generate the Prisma client for the new Notification model
npx prisma generate

# 2. Apply the new table to the database (pick ONE):
npx prisma migrate dev --name add_notifications   # dev / with migration history
# or
npx prisma db push                                # quick apply, no migration file

# 3. Build + run as usual
npm run build && npm run start:prod
```

Frontend: rebuild as usual (`npm run build`).

### Notes
- iOS Safari shows the in‑app popup + sound in any tab; the *native OS* popup on
  iOS only works when the app is installed to the Home Screen as a PWA (iOS 16.4+).
  Desktop and Android Chrome get native OS popups directly.
- No existing data is changed; the feature is additive.
