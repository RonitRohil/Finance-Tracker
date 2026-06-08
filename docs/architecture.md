# Architecture — Finance Tracker

_Personal finance app for one owner, used from a phone and a laptop. This document records the current architecture, the decisions behind it (ADR-style), and how those decisions hold up for everyday single-user use across mobile + desktop._

---

## 1. System context

```
            ┌──────────────────────────────┐
            │        You (one owner)        │
            │   phone browser · laptop      │
            └───────────────┬──────────────┘
                            │ HTTPS (static assets)
                            ▼
        ┌───────────────────────────────────────────┐
        │   Static SPA (GitHub Pages)                │
        │   React 19 + Vite build, hash routing      │
        │   ──────────────────────────────────────   │
        │   pages ▸ useAppData ▸ dataService          │
        │   localStorage: offline buffer, mappings    │
        └───────────────┬───────────────────────────┘
                        │ supabase-js (REST + Auth, JWT)
                        ▼
        ┌───────────────────────────────────────────┐
        │   Supabase (managed Postgres)              │
        │   11 tables · Row-Level Security per user  │
        │   Auth: email/password, single owner       │
        └───────────────────────────────────────────┘
```

There is **no application server**. The browser talks directly to Supabase; RLS is the entire authorization layer. This is the defining architectural property — everything else follows from it.

---

## 2. Runtime layers (inside the SPA)

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Shell / routing** | `App.tsx`, `components/Layout.tsx` | Tab state synced to URL hash; sidebar (desktop) + bottom nav (mobile); global search; sync indicator. |
| **Auth gate** | `components/AuthGuard.tsx` | Supabase session restore/sign-in; triggers one-time legacy→Supabase migration. |
| **State** | `hooks/useAppData.ts` | Single source of truth `PortfolioData`; load, optimistic partial updates, online/offline flush. |
| **Scheduler** | `hooks/useAutoScheduler.ts` | Derives SIP/RD/recurring auto-expenses from schedules on each data change. |
| **Persistence** | `lib/dataService.ts` | Maps app models ↔ Supabase rows; per-slice writes; offline buffering. |
| **Domain logic** | `lib/utils.ts`, `utils/stockNormalizer.ts`, `utils/groupByDate.ts` | Pure finance math, balance deltas, recurring expansion, stock grouping. |
| **Normalization** | `lib/storage.ts` | Defaults, shape-backfilling, legacy migration of the in-memory model. |
| **Feature pages** | `pages/*` | Dashboard, BankAccounts, Transactions, Investments, StockMappings, Loans, Settings. |

The dependency direction is clean and one-way: **pages → hooks → dataService → supabase**, with `utils`/`types` as shared leaves. No page imports the Supabase client directly.

---

## 3. Architecture Decision Records

These capture the choices already made, with the trade-offs as they actually play out for this app. New decisions to make are in §5.

### ADR-001 — Serverless: browser ↔ Supabase with RLS as the only authz
**Status:** Accepted (in place).
**Context:** One user, wants cloud sync across phone + laptop, minimal ops.
**Decision:** No backend. The SPA calls Supabase directly; `"owner only" using (auth.uid() = user_id)` policies on all 11 tables enforce isolation.
**Consequences:**
- 👍 Zero server to run, patch, or pay for. Sync across devices for free. Trivial deploy (static files).
- 👍 RLS is robust and correctly applied here.
- 👎 **No place for server-side secrets** — this is exactly why the Gemini feature can't work client-side (see code-review H4). Any AI/LLM, broker API, or scheduled job needs a Supabase Edge Function.
- 👎 No server-side validation: a bug in client mapping writes bad data straight to the DB.
**Revisit when:** you want live broker price sync, AI insights, or scheduled jobs → add **one** Edge Function, don't stand up a backend.

### ADR-002 — Local-first with optimistic writes + offline buffer
**Status:** Accepted.
**Context:** Mobile use means flaky connectivity; the UI must feel instant.
**Decision:** `updateData` mutates local state immediately, then persists. Offline writes go to a localStorage buffer (`myportfolio_offline_buffer`) and flush on `online`.
**Consequences:**
- 👍 Instant UI, works on the subway.
- 👎 "Optimistic" with no rollback: if the write fails for a non-network reason, local and remote diverge silently (code-review M-series, TD-4).
- 👎 Buffer replays without dependency ordering (TD-5).
**Revisit when:** you edit from two devices in the same session — last-write-wins at row granularity could clobber. For one person this is rare but possible.

### ADR-003 — One denormalized in-memory model (`PortfolioData`), normalized tables
**Status:** Accepted.
**Context:** The UI wants nested objects (a fund with its lumpsums, a portfolio with its holdings); Postgres wants flat rows.
**Decision:** Keep a single nested `PortfolioData` in memory; `dataService` flattens to/from 11 tables. Income/expense/transfer collapse into one `transactions` table discriminated by `type`.
**Consequences:**
- 👍 Pages get ergonomic nested data; one object to reason about.
- 👎 The mapping layer is large and is where the O(n) write bug lives (code-review H1). The nested model makes "what changed?" hard to answer cheaply.
**Revisit:** pair with a diff-based writer (fix-prompts FP-1) rather than replacing the model.

### ADR-004 — `localStorage` confined to three jobs
**Status:** Accepted.
**Decision:** localStorage holds only the offline buffer, the migration flag, and `stock_name_mappings` (plus legacy fallback). Supabase is source of truth when online.
**Consequences:** 👍 Clear boundary, small surface. 👎 Stock mappings live in localStorage **and** mirror into the `settings` row, so they can disagree across devices until a settings write syncs them.

### ADR-005 — Text primary keys generated client-side
**Status:** Accepted.
**Decision:** IDs are app-generated strings (`acc_cash`, `sip_auto_*`, etc.), tables use `id text primary key`.
**Consequences:** 👍 Deterministic ids enable idempotent auto-gen entries and offline creation without a server round trip. 👎 The `settings` table abuses this with a global `'singleton'` key (TD-20).

### ADR-006 — Hash-based routing, no router library
**Status:** Accepted.
**Decision:** `App.tsx` reads/writes `window.location.hash` for tab state.
**Consequences:** 👍 Works on GitHub Pages (no server rewrites needed), zero deps. 👎 No nested routes, no deep-linking into a specific transaction/modal, no history beyond tab. Fine at current scope.

---

## 4. Mobile + laptop usage architecture

This is a **responsive single codebase**, not separate apps. The responsive strategy is explicit in `index.css`:

- A `.phone-shell` container caps width at 480px on mobile and goes full-width at the `1024px` breakpoint.
- `.mobile-only` / `.desktop-only` utility classes (`display` toggled at 1024px) drive layout swaps.
- `Layout.tsx` renders a **sidebar on desktop** and a **bottom tab bar + quick-add sheet on mobile**.
- Bottom sheets (`Sheet`) on mobile vs centered `Modal` on desktop for the same forms (`UI.tsx`).
- Safe-area insets (`env(safe-area-inset-bottom)`) and `100dvh` are handled for mobile browser chrome.
- A dedicated `@media print` block hides nav/buttons so the Dashboard prints as a report.

**Implications for the daily-driver goal:**
- The mobile quick-add path (bottom nav → add sheet in `Layout.tsx`) is the critical surface for daily transaction entry. It should be the fastest path in the app: pre-filled date, last-used account, category recall. Optimizing it is a product priority, not just a UI nicety (see system-design §"Daily entry").
- Because state is local-first, mobile entry feels instant even on poor signal — the architecture already supports the use case; the gap is entry ergonomics and the sync-cost issues in §3.
- Cross-device consistency relies on each device pulling fresh on load (`fetchPortfolioData` on mount). There's no realtime subscription, so a transaction added on the phone appears on the laptop only after a reload. For one user this is usually acceptable; consider Supabase Realtime later if you want live cross-device updates.

---

## 5. Open architectural decisions (to make next)

These map to your stated goals. Each is written as a question to resolve; recommended directions are in `system-design.md` and `fix-prompts.md`.

1. **Where does AI analysis run?** → Edge Function (recommended) vs. drop the feature. (ADR-001 consequence.)
2. **Is imported history "facts only" or does it drive balances?** → Decide the balance model (stored vs. derived, TD-6) before wiring transfers into import.
3. **What is a stock's canonical identity?** → ISIN > normalized ticker > name. Locks how Zerodha/Groww merge (TD-7).
4. **Do you want live cross-device updates?** → Supabase Realtime subscription vs. reload-on-load. Affects whether two open tabs stay consistent.
5. **Broker import: file-based or API?** → CSV/file import (no secrets, fits ADR-001) vs. broker APIs (needs Edge Function + token storage). Start file-based.

---

## 6. Quality attributes scorecard

| Attribute | Current state | Notes |
|-----------|---------------|-------|
| **Usability (mobile)** | Good | Thoughtful responsive shell; entry speed is the next lever. |
| **Performance** | At risk | Degrades with transaction count (H1/H2). Fine today, not at 1,000s. |
| **Reliability** | Moderate | Optimistic writes with no rollback; no error boundary. |
| **Security** | Good (for scope) | RLS correct; single owner; no server secrets exposed *because* AI is dead. Don't add client-side keys. |
| **Maintainability** | Moderate | Clean layering, but huge page files and zero tests. |
| **Cost / ops** | Excellent | Static hosting + Supabase free tier; no servers. |

Bottom line: the architecture is **well-suited to exactly what you want** (one person, two devices, cloud sync, no ops). The work ahead is hardening the data layer for volume and correcting two domain models (balances, stock identity) — not re-architecting.
