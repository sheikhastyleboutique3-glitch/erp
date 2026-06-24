# UI/UX Refactor — Swiss-Minimalist Design System

Generated from the **UI/UX Pro Max** skill. Source of truth:
`design-system/restaurant-ops-erp/MASTER.md` (also copied to `design-system/MASTER.md`).

## Design system (MASTER)

| Token | Light | Dark | Tailwind class |
|-------|-------|------|----------------|
| Page canvas | `#F8FAFC` | `#020617` | `bg-bg` |
| Surface (cards/tables) | `#FFFFFF` | `#0F172A` | `bg-surface` |
| Muted surface (table head) | `#F1F5F9` | `#1E293B` | `bg-surface-2` |
| Foreground text | `#020617` | `#F1F5F9` | `text-fg` |
| Muted text | `#475569` | `#94A3B8` | `text-fg-muted` |
| Subtle text | `#94A3B8` | `#64748B` | `text-fg-subtle` |
| Border | `#E2E8F0` | `#1E293B` | `border-border` |
| Primary (navy sidebar/headings) | `#0F172A` | `#0B1220` | `bg-primary` |
| Accent / CTA (sky) | `#0369A1` | `#38BDF8` | `bg-accent` |
| Accent subtle (chips/active) | `#E0F2FE` | sky/14% | `bg-accent-subtle` |
| Focus ring | `#0369A1` | `#38BDF8` | `ring-ring` |
| Success / Warning / Destructive | `#059669` / `#D97706` / `#DC2626` | brightened | `text-success` etc. |

- **Typeface:** Inter (already loaded in `index.html`), tabular numbers via the `.nums` helper.
- **Spacing & shadow tokens** from MASTER are defined as CSS variables and exposed
  as `shadow-elev-{sm,md,lg,xl}`.
- **Dark mode** is driven entirely by CSS variables — components use `bg-surface` /
  `text-fg` / `border-border` and switch automatically with the `.dark` class.

## What was refactored (production-ready)

**Theme engine**
- `src/index.css` — semantic token system (light + dark), spacing/shadow tokens,
  visible focus ring, reduced-motion support, scoped transitions.
- `tailwind.config.js` — `darkMode: 'class'`, semantic colors, `shadow-elev-*`.
- `src/lib/theme.ts` — new **Swiss Pro** preset (default), `dark` flag in
  `ThemeState`, `applyTheme` toggles `.dark`, `toggleDarkMode()`, OS-preference
  detection, persisted to localStorage + the `branding` Settings group
  (`theme_dark`). The brand ramp is re-skinned to the MASTER sky+navy scale, so
  **every legacy `brand-*` usage across all pages adopts the new palette**.

**Shared primitives (used app-wide, now token + dark aware, Heroicons)**
- `LoadingSpinner`, `Modal`, `PageHeader`, `StatsCard`, `StatusBadge`
  (StatsCard/StatusBadge kept backward-compatible — existing callers compile).

**Layout** (`components/Layout.tsx`)
- Heroicons nav (no emojis), clean navy sidebar, accent active state, unread
  badges, **dark-mode toggle** + sound toggle in the top bar.

**Inventory page** (`pages/InventoryPage.tsx`) — reference implementation
- Enterprise toolbar (search + filters + segmented tabs), Heroicons.
- Data table fixes: **sticky header**, **skeleton loading rows**, distinct
  **hover rows**, **right-aligned numeric/quantity** columns (`.nums`),
  left-aligned text, **compact padding**, empty-state with icon.
- All colors use theme tokens; modal restyled.

## Rollout to the remaining pages

The pattern is mechanical. For each remaining page replace:

| Old | New |
|-----|-----|
| `bg-white` | `bg-surface` |
| `bg-gray-50` (header/muted) | `bg-surface-2` |
| `text-gray-900` | `text-fg` |
| `text-gray-500/600` | `text-fg-muted` |
| `text-gray-400` | `text-fg-subtle` |
| `border-gray-100/200` | `border-border` |
| `bg-brand-600 text-white` (CTA) | `bg-accent hover:bg-accent-hover text-accent-fg` |
| emoji icon | Heroicon component (`@heroicons/react/24/outline`) |
| numeric `<td>` | add `text-end nums` |

Pages still using raw `gray/white` classes render correctly in **light mode**
(the default) and adopt the new accent palette automatically; apply the table
above to make them fully dark-mode correct. The Inventory page is the template.

No backend or data changes. Heroicons (`@heroicons/react@^2`) was already a
dependency — no new packages.
