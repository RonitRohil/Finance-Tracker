# Code Review — Finance Tracker

_Reviewed: June 2026 · Scope: full `src/` tree (~9,400 LOC) + `supabase/schema.sql` · Reviewer: engineering audit_

This is a single-user personal finance SPA (React 19 + Vite + Supabase). TypeScript compiles clean (`tsc --noEmit` passes with zero errors), the architecture is sensible, and the finance math is mostly careful. The issues below are about **scale, correctness under edits, and dead features** — exactly the things that bite once this becomes your daily-driver app.

Severity legend: 🔴 High (fix before heavy daily use) · 🟠 Medium · 🟡 Low / cleanup.

---

## 🔴 High

### H1. Every transaction edit rewrites the entire transactions table
**`src/lib/dataService.ts` → `persistPortfolioChanges()` (income/expense/transfer branch)**

When any income, expense, or transfer changes, the code maps **all** transactions and upserts every row:

```ts
const nextTransactions = mapTransactionToRows(next, userId); // ALL income+expense+transfer
await safeUpsertRows(TABLES.transactions, nextTransactions);
```

Adding one expense to a list of 2,000 transactions sends 2,000 rows over the wire — every time. For a daily-transaction app this turns a 1-row write into an O(n) write that grows forever. It also sets `updated_at = now()` on every row, so you lose the ability to tell which row actually changed.

**Impact:** Slow saves, wasted bandwidth/quota, write amplification, and a real risk of hitting Supabase request-size limits once history is large.
**Fix direction:** Diff `previous` vs `next` and upsert only changed/added rows; delete only removed ids (the `diffIds` helper already exists — apply the same idea to upserts). See `fix-prompts.md` → FP-1.

---

### H2. No debounce/batching on writes; scheduler re-runs on every state change
**`src/hooks/useAppData.ts` → `updateData()`** and **`src/hooks/useAutoScheduler.ts`**

`updateData` fires a Supabase round trip synchronously on every call. `useAutoScheduler` runs on **every** `data` change and does a full `JSON.stringify` of all expenses + investments + recurring rules to decide whether to write back:

```ts
const currentSnapshot = JSON.stringify({ expenses, investments, recurringRules });
```

With large history this stringify runs on every render-causing update, and any auto-generated change triggers another `updateData` → another network write → another render. Two expensive systems feeding each other.

**Impact:** UI jank and redundant network writes that scale with history size.
**Fix direction:** Debounce persistence (e.g. 500–800 ms) and/or batch writes; replace the stringify diff with a cheaper signature (counts + last-modified). See `fix-prompts.md` → FP-2.

---

### H3. `clearRemotePortfolioData` deletes tables in parallel — FK race
**`src/lib/dataService.ts` → `clearRemotePortfolioData()`**

All eleven table deletes are fired with `Promise.all`. `transactions.from_account_id` / `to_account_id` reference `bank_accounts(id)` **without `ON DELETE CASCADE`** (see `schema.sql`). If `bank_accounts` is deleted before `transactions`, Postgres raises a foreign-key violation and the wipe fails partway, leaving orphaned data.

```ts
await Promise.all([
  supabase.from(TABLES.transactions).delete().neq("id", ""),
  supabase.from(TABLES.bankAccounts).delete().neq("id", ""), // races the line above
  ...
]);
```

**Impact:** "Clear all data" can fail nondeterministically and leave the account in a half-wiped state.
**Fix direction:** Delete child tables before parents in sequence (transactions, holdings, lumpsums → then accounts/portfolios/funds → then settings), or add `ON DELETE CASCADE`/`SET NULL` to the FKs. See `fix-prompts.md` → FP-3.

---

### H4. Gemini AI insights feature is dead and structurally broken
**`src/services/geminiService.ts`**

Three separate problems:
1. **Never called.** `analyzePortfolio` is exported but not imported anywhere (`grep` finds only the definition). The Dashboard has no insights UI.
2. **Wrong env access.** `process.env.GEMINI_API_KEY` does not exist in a Vite browser bundle — client env must be `import.meta.env.VITE_*`. If this module were ever imported, it would read `undefined` (and `process` itself is undefined in the browser, risking a `ReferenceError`).
3. **Secret exposure risk.** Any LLM key shipped to the browser is public. AI calls like this belong behind a serverless function, not in client code.

**Impact:** A whole "feature" that silently does nothing; a latent crash if wired up naively; a security foot-gun if a real key is added.
**Fix direction:** Either delete the module, or move analysis behind a Supabase Edge Function and call it from the Dashboard. See `fix-prompts.md` → FP-4.

---

## 🟠 Medium

### M1. myMoney import ignores transfers and never updates balances
**`src/pages/Settings.tsx` → `handleMyMoneyImport()` / `runMappedImport()`**

The SQLite query filters `DO_TYPE IN ('0','1')` (income/expense) and drops `DO_TYPE = 3` (transfers between accounts), so account-to-account moves are lost on import. Separately, `runMappedImport` pushes rows via `mergeImportedEntries` but **does not apply balance deltas** the way the manual `saveIncomeEntry`/`saveExpenseEntry` paths do. So imported history doesn't reconcile against the balances you typed in.

**Impact:** Missing transfers and balances that don't tie out to imported transactions — a problem given the goal of making this the system of record.
**Fix direction:** Import transfers as `TransferEntry`s; decide explicitly whether imports are "historical only" (no balance touch) or should recompute balances from a starting point. See `system-design.md` → "Import pipeline" and `fix-prompts.md` → FP-6.

### M2. Bulk import does one giant upsert (compounds H1)
**`src/pages/Settings.tsx` → `runMappedImport()` → `updateData({ income, expenses, ... })`**

Because of H1, importing hundreds/thousands of myMoney rows triggers a single upsert of the **entire** merged transaction set. Large imports may exceed Supabase payload limits or time out.
**Fix:** Chunk imports (e.g. 500 rows/batch) and reuse the diff-based writer from H1.

### M3. Merged stock view depends entirely on local name mappings
**`src/lib/utils.ts` → `getCombinedStockHoldings()`**, **`src/utils/stockNormalizer.ts`**

Same-stock grouping keys on `normalizeStockName`, which only merges names present in `BUILTIN_MAPPINGS` or the user's localStorage map. Zerodha (`INFY`) and Groww (`Infosys Limited`) merge **only** because that exact pair is hardcoded. Any unmapped pair silently shows as two separate holdings, double-counting positions. Also `currentPrice: holding.currentPrice || existing.currentPrice` keeps whichever portfolio's price came last, which can disagree across brokers.

**Impact:** Incorrect merged portfolio totals — directly the "recorrect the merged view logic" item you flagged.
**Fix direction:** Group by a canonical key (prefer ISIN if available, then normalized ticker, then name) and treat mappings as overrides, not the only mechanism. See `system-design.md` → "Stock identity & merge" and `fix-prompts.md` → FP-7.

### M4. Account balances are mutable state, not derived — drift risk
**`src/lib/utils.ts` (delta helpers) + `src/pages/BankAccounts.tsx`**

Balances are stored numbers mutated by per-transaction deltas (`withUpdatedAccountBalances`) **and** editable directly on the Bank Accounts screen. There's no reconciliation between "balance field" and "sum of transactions." A missed delta (e.g. the import path in M1, or an interrupted sync) permanently desyncs the displayed balance from reality with no way to detect it.

**Impact:** Silent balance drift — corrosive for a finance app you trust.
**Fix direction:** Add a reconciliation/recompute action (opening balance + Σ transactions) and/or a "balance vs computed" indicator. See `fix-prompts.md` → FP-8.

### M5. Hard crash when Supabase env vars are missing
**`src/lib/supabase.ts`**

```ts
if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables.");
```

A top-level `throw` at module load white-screens the entire app with no UI, no message, no recovery. On GitHub Pages a missing CI secret produces a blank page.
**Fix:** Render a friendly configuration-error screen instead of throwing at import time.

### M6. Offline flush can drop ordering / partially abort
**`src/lib/dataService.ts` → `flushOfflineBuffer()`**

On a non-offline error mid-loop the function `throw`s, leaving already-processed writes removed but the failing one and everything after it unprocessed (the `remaining` array only captures offline-classified failures). Buffered writes are also replayed without dependency ordering (a transaction referencing an account could flush before the account).
**Fix:** Sort buffer by dependency/timestamp, and on hard error keep the unprocessed tail in the buffer.

---

## 🟡 Low / cleanup

- **L1. `settings` primary key is the literal string `'singleton'`** (`schema.sql`), globally unique rather than per-user. Harmless for one user, but it's a multi-user landmine and an odd smell. Key on `user_id` instead.
- **L2. CSV export isn't injection-safe** (`exportToCsv`): values starting with `=`,`+`,`-`,`@` aren't escaped. Low risk for personal use, but trivial to harden.
- **L3. `getNetWorthTrend`** compares dates with the string hack `entry.date <= \`${pointKey}-31\``. Works for ISO strings but is fragile; use a real month-end boundary.
- **L4. Magic strings for auto-generated entries** (`sip_auto_`, `rd_auto_`, `rec_`, `sip:`, `rd:`) are scattered across `utils.ts`. Centralize as constants to avoid drift.
- **L5. No error boundaries.** Any render throw in a page blanks the app. Add a top-level React error boundary.
- **L6. `console.error`/`alert` are the only error surfaces** for sync and import failures. The user gets a silent failure or a blocking `alert`. Consider a lightweight toast.
- **L7. Dead/unused deps & files.** `express` and `@types/express` are in `dependencies` but there's no server; `geminiService.ts` is unused (see H4). Prune to shrink install and bundle.
- **L8. `metadata.json` / `.codex-vite.log`** and `PROJECT_REFERENCE.md` reference the old path `D:/Ronit/Personal/My-PortFolio` — stale after the move to `Finance-Tracker`.

---

## What's genuinely good

- Clean separation: `dataService` (persistence) ↔ `useAppData` (state) ↔ pages (UI). Easy to reason about.
- Finance helpers in `utils.ts` are pure and composable (`combineBalanceDeltas`, `invertDeltas`, save/delete entry functions) — edits correctly reverse the previous delta before applying the new one.
- RLS is enabled and correctly scoped (`auth.uid() = user_id`) on every table.
- Offline buffering exists at all, which most hobby apps skip.
- Strong typing throughout; `normalizePortfolioData` defensively backfills missing fields and even migrates the legacy `stocks` → `stockPortfolios` shape.

---

## Suggested fix order (for daily-driver readiness)

1. **H1 + M2** — diff-based transaction writes (unblocks large history & imports).
2. **H2** — debounce persistence + cheaper scheduler diff.
3. **M3 / FP-7** — correct merged stock identity.
4. **M1 / FP-6** — import transfers + balance reconciliation.
5. **H3, M5, M4** — data-safety hardening.
6. **H4 + L-series** — remove dead code, add error boundary, prune deps.

Ready-to-paste Claude Code prompts for each are in [`fix-prompts.md`](./fix-prompts.md).
