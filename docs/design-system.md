# Design System — Finance Tracker

_Reverse-engineered from the code (`src/index.css`, `src/components/UI.tsx`, `src/components/Layout.tsx`). This documents the tokens, components, and patterns the app already uses, so future changes stay consistent. Where it should later be reconciled against your reference designs in `D:\Ronit\Personal\designs\Expense-Portfolio-Designs` (not accessible in this session), those points are flagged ⚑._

The system is a **dark-first, mobile-first, financial-dashboard** aesthetic: near-black backgrounds, hairline borders, a single emerald accent, and tabular/monospaced numerals for money.

---

## 1. Design tokens (`src/index.css`, `:root`)

### Color — surfaces & ink
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#06080c` | App background (near-black) |
| `--bg-2` | `#0b1017` | Raised surface / sheet / modal |
| `--bg-3` | `#111823` | Inputs, soft buttons, chips |
| `--line` | `#1c2633` | Hairline border (via `.hairline`) |
| `--line-2` | `#2a3647` | Stronger hairline (`.hairline-2`) |
| `--ink` | `#e6edf7` | Primary text |
| `--ink-2` | `#b2bfd1` | Secondary text |
| `--ink-3` | `#7b8799` | Tertiary / labels |
| `--ink-4` | `#4e5a6e` | Muted / placeholders / uppercase labels |

### Color — semantic (OKLCH)
| Token | Value | Role |
|-------|-------|------|
| `--accent` | `oklch(0.72 0.14 160)` | Primary emerald — CTAs, focus, active |
| `--accent-soft` | `oklch(0.72 0.14 160 / 0.12)` | Accent tint backgrounds |
| `--pos` | `oklch(0.74 0.14 155)` | Positive / income / gains |
| `--neg` | `oklch(0.70 0.16 22)` | Negative / expense / danger |
| `--warn` | `oklch(0.80 0.14 75)` | Warnings (budget, maturities) |
| `--info` | `oklch(0.72 0.14 235)` | Info |
| `--violet` | `oklch(0.70 0.14 295)` | Accent variety (charts/categories) |

> Convention: colors are consumed as `text-[color:var(--ink)]`, `bg-[color:var(--bg-2)]` etc. — CSS variables through Tailwind arbitrary values, **not** Tailwind's palette. Keep this; don't introduce raw hex or Tailwind named colors in components. ⚑ Verify the emerald hue/exact values against the reference palette.

### Typography
| Family | Class | Use |
|--------|-------|-----|
| Inter (body) | default (`body`) | All UI text. Font-feature settings `cv11, ss01, ss03`. |
| Inter Tight | `.font-display` | Headings/titles, `letter-spacing: -0.02em`. |
| JetBrains Mono | `.font-mono-num` | Monetary figures. |
| — | `.tabular` / `.font-mono-num` | `font-variant-numeric: tabular-nums` so amounts align. |

Money should always render with tabular numerals via `formatCurrency()` (`utils.ts`, `en-IN` / INR, 2 decimals). Don't hand-format currency.

### Radii, spacing, motion
- **Radii:** components use specific pixel radii — buttons `10/12/14px` (sm/md/lg), inputs `14px`, cards large rounded, sheets `24px`, modals `24px`, chips full-round. Treat these as the radius scale.
- **Hairlines:** `.hairline` / `.hairline-2` = `inset 0 0 0 1px var(--line|line-2)` box-shadows (crisper than borders on dark).
- **Motion:** `sheetIn` (0.28s ease-out cubic-bezier) for bottom sheets, `fadeIn` (0.18s) for overlays, `dotPulse` for the sync dot, `.chev.open` rotate for expanders, `active:scale-[0.98]` press feedback on buttons. Keep durations in the 0.18–0.28s range.

---

## 2. Layout & responsive system

Defined in `index.css` + `Layout.tsx`. **Breakpoint: `1024px`.**

- `.phone-shell` — max-width 480px on mobile, full-width ≥1024px; `100dvh`, overflow hidden (app-shell feel).
- `.mobile-only` / `.desktop-only` — visibility swap at 1024px.
- **Mobile:** bottom tab navigation + floating quick-add → opens a `Sheet`. Safe-area insets via `env(safe-area-inset-bottom)`.
- **Desktop:** persistent left sidebar + top header with global search.
- `.no-scrollbar` / `.scroll-area` hide scrollbars; `.checker-bg` for empty/placeholder fills; `.divider-soft` = `rgba(255,255,255,.06)` dividers.
- **Print:** `@media print` hides `aside/header/nav/button` and expands `main` — the Dashboard doubles as a printable report (`handlePrintExport` in Settings).

Same form, two shells: use `Sheet` (bottom) on mobile and `Modal` (centered) on desktop. Both already exist in `UI.tsx`.

---

## 3. Component library (`src/components/UI.tsx`)

The shared primitives. Reuse these; don't re-roll one-off styled divs.

### Button
`variant`: `primary | secondary | soft | ghost | danger` · `size`: `sm | md | lg` · `block`, `icon` props.
- `primary` — emerald fill, dark text, soft glow shadow; the single main action per view.
- `secondary` — translucent white + hairline.
- `soft` — `--bg-3` surface, muted ink.
- `ghost` — transparent, for low-emphasis/tertiary.
- `danger` — `--neg` fill; destructive only.
- All: `font-semibold`, `active:scale-[0.98]`, `disabled:opacity-40`. Heights 8/10/12 (sm/md/lg).

> Rule of one primary: each screen/sheet has exactly one `primary` button. Everything else is secondary/soft/ghost.

### Inputs — `Input`, `Select` (wrapped by `FieldShell`)
- `FieldShell` renders the **uppercase tracked label** (`--ink-4`, 11px, `tracking-[0.08em]`) and an optional error in `--neg`.
- `Input`/`Select` — `--bg-3` surface, inset hairline ring, focus ring `--accent/55`, radius 14px. `Select` has a custom chevron.
- Number inputs hide native spinners (global CSS).

### Containers — `Card`, `Sheet`, `Modal`
- `Card` — primary content surface; optional `title` (`font-display` 15px) + `subtitle` (`--ink-3` 11.5px) + `action` slot; `padded` toggle.
- `Sheet` — mobile bottom sheet: grabber handle, title/subtitle, scrollable body capped at `70dvh`, sticky footer with safe-area padding, `sheetIn` animation, scrim `bg-black/60`.
- `Modal` — desktop centered dialog (max-w-2xl, radius 24, `hairline-2`), body capped `80vh`. On mobile `Modal` delegates to `Sheet`.

### Data display — `Table`, `Chip`, `Badge`
- `Table` — borderless, hairline row dividers (`divide-white/[0.04]`), left-aligned, optional sortable headers with indicator; horizontal scroll wrapper.
- `Chip` — full-round, uppercase 10.5px tracked label, tone-colored; the base for status pills.
- `Badge` — semantic wrapper over `Chip`: `success | warning | danger | info | secondary` → maps to tones. Use for statuses (Active/Paused/Stopped, severities).

### Charts
Recharts is the charting library (cashflow series, net-worth trend, category breakdowns). Use the semantic tokens (`--pos`, `--neg`, `--accent`, `--violet`, `--info`) for series colors so charts match the system. ⚑ Confirm chart styling against reference designs.

---

## 4. Iconography
`lucide-react` via a thin `Icon` wrapper (`components/Icon.tsx`). Stick to Lucide for visual consistency; size/stroke through the wrapper.

---

## 5. Usage rules (the short version)

1. **Color only via tokens** — `var(--*)` through Tailwind arbitrary values. No raw hex, no Tailwind named colors in components.
2. **Money is always** `formatCurrency()` + tabular numerals. Income/positive → `--pos`, expense/negative → `--neg`.
3. **One `primary` button per view.** Destructive actions use `danger` and a confirm.
4. **Forms reuse `Input`/`Select`/`FieldShell`;** present in `Sheet` (mobile) / `Modal` (desktop).
5. **Surfaces step up** `--bg` → `--bg-2` → `--bg-3`; separate with `.hairline`, not heavy borders.
6. **Respect the 1024px breakpoint** and the `mobile-only`/`desktop-only` pattern; never hardcode a layout that breaks the phone shell.
7. **Motion stays subtle** (0.18–0.28s) and uses the existing keyframes.

---

## 6. Gaps & reconciliation backlog

- ⚑ **Compare against reference designs** in `Expense-Portfolio-Designs` once accessible: exact palette, type scale, spacing grid, component states (hover/pressed/disabled/empty/loading), and any components the references show that the code lacks.
- **No documented empty/loading/error states** as reusable components — only ad-hoc (`Loading your portfolio...` text, `.checker-bg`). Define standard Empty / Skeleton / Error components.
- **No spacing scale token set** — spacing is via Tailwind utilities inline. Consider documenting an 4/8px-based scale if the references imply one.
- **Toast/notification component missing** (errors use `alert()`); the design system should own one (ties to tech-debt TD-15).
- **No light theme** — system is dark-only. Confirm that matches the reference intent.

---

_This doc was generated from code. Treat it as the source of truth for current components, and as a checklist to reconcile against the visual references when they're available._
