# ERP V8 — UI/UX Audit

**Frontend:** React 18 + Vite + TypeScript + Tailwind, 37 components / 21 pages,
bilingual (Arabic RTL + English LTR). **Method:** code review against the
`ui-ux-pro-max-2` design-intelligence skill + accessibility heuristics.

## Recommended design pattern (from the skill)
For an internal, multi-branch, data-heavy supply-chain tool the skill recommends
the **Data-Dense Dashboard** pattern: minimal padding, grid layouts, KPI cards,
data tables, full light **and** dark support, WCAG AA. This matches the existing
Swiss-minimalist direction — the foundation is sound; the gaps below are about
accessibility polish and consistency, not a redesign.

---

## 🟢 Strengths (keep these)
- **Theming done right.** Semantic CSS-variable tokens in `index.css` with a
  `.dark` override and a `ThemePicker` component — true light/dark theming, not
  scattered `dark:` utilities. Brand navy/sky tokens are centralized.
- **Responsive tables.** 17 tables with 18 `overflow-x` wrappers — horizontal
  scrolling is contained, not page-level.
- **Loading & error states** present in ~25 / ~24 files (React Query driven).
- **RTL support** wired through i18n (26 references) for Arabic.

## 🟠 Accessibility gaps (highest priority)
1. **Icon-only buttons lack labels.** 177 `<button>` elements but only 10
   `aria-label`s. Every icon-only control (edit/delete/close/sort, theme toggle,
   notification bell) needs an `aria-label` or visually-hidden text, or it is
   unusable with a screen reader. *Fix: add `aria-label` to all icon buttons.*
2. **Focus outlines removed.** `focus:outline-none` appears across 10+ pages.
   Where it isn't paired with a visible `focus-visible:ring`, keyboard users lose
   the focus indicator. *Fix: ensure every `focus:outline-none` has a matching
   `focus-visible:ring-2 ring-brand-500` (the codebase already uses this pattern
   in places — make it universal).*
3. **One `<img>` without `alt`** (5 of 6 have it). *Fix: add `alt` (empty `alt=""`
   for decorative images).*
4. **Weak empty states.** Only 4 files handle the "no data" case. Data tables
   should show a friendly empty state ("No requisitions yet") instead of a blank
   table. *Fix: add an `EmptyState` component and use it in list pages.*

## 🟡 Maintainability / UX consistency
5. **Monolithic pages.** `AdminPage.tsx` (~930 lines), `CatalogPage.tsx` (~795),
   `PurchaseOrdersPage.tsx` (~776) mix data fetching, tables, modals, and forms
   in one file. *Fix: extract table, filters, and modal into sub-components +
   custom hooks (`useRequisitions`, etc.) — improves readability and reduces
   re-renders.*
6. **Form field consistency.** Verify all inputs use a shared field component
   with label + hint + error message wired to `aria-describedby` (helps both UX
   and a11y finding #1).
7. **Color is sometimes the only status signal.** Status badges
   (SUBMITTED/APPROVED/DISPATCHED…) should pair color with a text label or icon
   so color-blind users and printed PDFs remain readable.

## ♿ WCAG AA checklist (from the skill's quick-reference)
- [ ] Text contrast ≥ 4.5:1 in **both** themes (verify the navy-on-navy sidebar
      and sky accent in dark mode).
- [ ] Visible focus state on every interactive element (finding #2).
- [ ] `prefers-reduced-motion` respected for any transitions/animations.
- [ ] Responsive at 375 / 768 / 1024 / 1440 px (the panel min is 400px).
- [ ] Every meaningful icon/image has a label; decorative ones are `aria-hidden`.
- [ ] RTL mirrors layout correctly (padding, icon direction, table alignment).

---

## Suggested order of work
1. Add `aria-label`s to icon buttons + fix focus outlines (quick, high impact).
2. Add a reusable `EmptyState` and apply to list pages.
3. Pair status colors with text/icon labels.
4. Refactor the three largest pages into components + hooks (do this alongside
   the backend pagination work so tables adopt server pagination at the same time).

> Tip: the `ui-ux-pro-max-2` skill can generate per-page design specs. Run
> `python3 /home/user/skills/ui-ux-pro-max-2/scripts/search.py "data table admin" --domain ux`
> for component-level UX guidance, or `--design-system --persist -p "ERP V8"` to
> write a `design-system/MASTER.md` the team can build against.
