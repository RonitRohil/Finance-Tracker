# Technical Debt Register — Finance Tracker

_Compiled June 2026. Single-user React 19 + Vite + Supabase SPA, ~9,400 LOC, no automated tests._

This register categorizes debt, scores each item, and gives a paydown order. It complements [`code-review.md`](./code-review.md) (specific defects) by taking the longer maintainability view. Scoring: **Impact** and **Effort** are each S/M/L. "Daily-driver" flag = matters specifically for using this as your everyday transaction app.

---

## Debt by category

### 1. Data layer & sync (highest-leverage debt)

| ID | Debt | Impact | Effort | Daily-driver |
|----|------|--------|--------|--------------|
| TD-1 | **Full-table upsert on every transaction edit** (`dataService.persistPortfolioChanges`). Write cost is O(total history) per edit. | L | M | ✅ |
| TD-2 | **No write debouncing/batching** (`useAppData.updateData`). Each change = one network round trip. | L | S | ✅ |
| TD-3 | **Whole-state diff via `JSON.stringify`** in `useAutoScheduler` runs on every change. | M | S | ✅ |
| TD-4 | **No optimistic-vs-confirmed write tracking.** On sync failure the local state and remote silently diverge; only a `console.error` is emitted. | M | M | ✅ |
| TD-5 | **Offline buffer has no ordering or dependency guarantees** (`flushOfflineBuffer`). | M | M | |
| TD-6 | **Balances are mutable, not derived** — no reconciliation against Σ transactions. | L | M | ✅ |

These six are the core of what makes daily use risky. TD-1/2/3 are performance; TD-4/5/6 are correctness-under-failure.

### 2. Domain logic

| ID | Debt | Impact | Effort | Daily-driver |
|----|------|--------|--------|--------------|
| TD-7 | **Stock identity depends on hardcoded name map** (`stockNormalizer` + `getCombinedStockHoldings`). No ISIN/ticker canonicalization; unmapped same-stock pairs double-count. | L | M | ✅ |
| TD-8 | **Import pipeline drops transfers and skips balance effects** (`Settings.runMappedImport`). | M | M | ✅ |
| TD-9 | **Auto-gen entry identity is string-prefix magic** (`sip_auto_`, `rd_auto_`, `rec_`, `sip:`, `rd:`) scattered across `utils.ts`. Easy to break silently. | M | S | |
| TD-10 | **Recurring-rule occurrence logic is dense and untested** (`getRecurringOccurrences`) — nested conditions for 13 frequencies, no tests guarding it. | M | M | ✅ |

### 3. Quality engineering / safety nets

| ID | Debt | Impact | Effort | Daily-driver |
|----|------|--------|--------|--------------|
| TD-11 | **Zero automated tests.** No unit tests on finance math, no integration tests on sync/import. Highest structural debt. | L | L | ✅ |
| TD-12 | **No error boundaries.** A render throw blanks the whole app. | M | S | |
| TD-13 | **No CI checks beyond a manual `tsc`.** `lint` script is just `tsc --noEmit`; no ESLint, no formatting, no test gate. | M | M | |
| TD-14 | **Hard crash on missing env** (`supabase.ts` throws at import). | M | S | |
| TD-15 | **User-facing errors are `alert()`/console only.** No toast/notification system. | M | M | ✅ |

### 4. Codebase hygiene

| ID | Debt | Impact | Effort | Daily-driver |
|----|------|--------|--------|--------------|
| TD-16 | **Dead code:** `geminiService.ts` (unused, broken env access). | S | S | |
| TD-17 | **Unused deps:** `express`, `@types/express` (no server in repo). | S | S | |
| TD-18 | **Oversized page components.** `Settings.tsx` (1,399 LOC), `Transactions.tsx` (1,306), `BankAccounts.tsx` (901), `Investments.tsx` (899) mix data wrangling, forms, and presentation in one file. | M | L | |
| TD-19 | **Stale references** to old path `D:/Ronit/Personal/My-PortFolio` in `PROJECT_REFERENCE.md`, `metadata.json`. | S | S | |
| TD-20 | **`settings.id = 'singleton'`** global PK instead of per-user key (`schema.sql`). | S | S | |
| TD-21 | **Magic numbers / inline config** (budget threshold 0.9, trend windows, slice limits) sprinkled through `utils.ts`. | S | S | |

---

## Prioritized paydown plan

Ordered by leverage (impact ÷ effort), weighted toward daily-driver readiness.

**Phase 1 — Make daily use fast & safe (do first)**
- TD-2 (debounce writes) — S effort, immediate UX win.
- TD-1 (diff-based transaction upserts) — the single most important fix; unblocks large history and bulk import.
- TD-3 (cheaper scheduler diff) — pairs naturally with TD-1/2.
- TD-14 (graceful env failure) + TD-12 (error boundary) — cheap safety.

**Phase 2 — Trustworthy numbers**
- TD-7 (canonical stock identity / merged view).
- TD-8 (import transfers + balance handling).
- TD-6 (balance reconciliation action).
- TD-11 *(start)* — add unit tests around the finance helpers you're about to touch (SIP/RD/recurring math, balance deltas, stock merge). Lock behavior before refactoring.

**Phase 3 — Structural health**
- TD-18 (split the giant pages into feature folders + extract form components).
- TD-9 / TD-21 (centralize constants).
- TD-13 (add ESLint + a test step to the GitHub Action).
- TD-4 / TD-5 / TD-15 (sync-failure surfacing, ordered offline flush, toast system).

**Phase 4 — Cleanup**
- TD-16, TD-17, TD-19, TD-20 — delete dead code, prune deps, fix stale refs, re-key settings. Low risk, do in one sweep.

---

## Debt you should consciously *keep*

Not all debt is worth paying down for a single-user app:

- **Single hardcoded owner / no signup flow** — intentional and correct for personal use. Don't "fix" it.
- **localStorage offline buffer** rather than a full sync engine (CRDT/PouchDB) — appropriate scope; revisit only if you go multi-device with concurrent edits.
- **GitHub Pages static hosting** — fine until you need server-side secrets (e.g. the AI feature), at which point add one Edge Function rather than a backend.

---

## Metric to watch

The clearest early-warning signal for TD-1/TD-2 is **save latency vs. transaction count**. Once you have ~500+ transactions, time a single expense add. If it's visibly laggy, Phase 1 is overdue. Until tests exist (TD-11), this manual check is your regression guard.

Paste-ready remediation prompts: [`fix-prompts.md`](./fix-prompts.md).
