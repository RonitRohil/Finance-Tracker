# Fix Prompts for Claude Code

_Copy-paste prompts to fix the issues found in [`code-review.md`](./code-review.md) and build the features in [`system-design.md`](./system-design.md). Each prompt is self-contained: paste one into Claude Code (in this repo) and let it work. They're ordered by priority for making this your daily-driver app._

**How to use:** run them roughly in order. FP-0 first (tests as a safety net), then Phase 1 (FP-1→FP-4), etc. Each prompt tells Claude what to change, the constraints, and how to verify. Don't run more than one at a time — review the diff between each.

**Global guardrails to keep in mind (the prompts repeat these):**
- This is a single-user app; never reintroduce multi-user concepts.
- Supabase is source of truth online; localStorage is only for offline buffer + migration flag + stock mappings.
- Don't change financial calculation logic unless the task explicitly says so.
- `tsc --noEmit` must stay clean after every change.

---

## FP-0 — Add a test harness and lock current behavior

```
Set up a minimal test harness for this Vite + React + TypeScript repo using Vitest.
- Add vitest + @testing-library/react as devDependencies and a "test" script in package.json.
- Do NOT change any app behavior.
- Write unit tests for the pure finance logic in src/lib/utils.ts that capture CURRENT behavior (characterization tests), covering:
  - balance deltas: getIncomeBalanceDelta, getExpenseBalanceDelta, getTransferBalanceDelta, combineBalanceDeltas, invertDeltas
  - save/delete entry round-trips reverse balances correctly (saveExpenseEntry then deleteExpenseEntry nets to zero)
  - SIP math: calculateSIPInvested / getComputedSipInvested for Active and Stopped
  - RD/FD value calcs: calculateRDValue, calculateFDValue
  - recurring expansion: getRecurringOccurrences for each frequency (daily, weekly, monthly, endofmonth, every3months, yearly) over a fixed date range, with a fixed "today"
  - stock merge: getCombinedStockHoldings with two portfolios holding the same and different stocks
- Add a CI step to .github/ that runs `tsc --noEmit` and `vitest run`.
Verify: `npm test` passes and `tsc --noEmit` is clean. Report coverage of utils.ts.
```

---

## FP-1 — Diff-based transaction writes (fixes O(n)-per-edit) 🔴

```
In src/lib/dataService.ts, persistPortfolioChanges currently re-maps and upserts ALL rows
of a changed slice on every edit (most painfully the transactions branch, which upserts every
income/expense/transfer row whenever one changes). Make writes diff-based so only changed,
added, or removed rows are sent.

Requirements:
- Add a per-table "last written" signature cache (id -> stable hash of the mapped row, e.g. a
  cheap JSON hash excluding updated_at). Compare next rows against it; upsert only rows that are
  new or whose hash changed. Keep the existing diffIds(...) for deletions.
- Only set updated_at on rows that actually changed.
- Apply this to ALL slices that map collections (bank_accounts, transactions, mutual_funds,
  mf_lumpsum_entries, stock_portfolios, stock_holdings, fixed_deposits, recurring_deposits,
  loans, recurring_rules). Settings stays a single-row upsert.
- Preserve the offline-buffer behavior (safeUpsertRows / safeDeleteRows) for the rows you do send.
- Do NOT change the in-memory model or the read path.
Constraints: single-user app; tsc --noEmit must stay clean; don't alter financial calc logic.
Verify: add/edit/delete one expense among many and confirm via network/log that only 1 row is
upserted (not all). Run the FP-0 tests; they must still pass.
```

---

## FP-2 — Debounce persistence + cheaper scheduler diff 🔴

```
Reduce redundant network writes and CPU.

1) In src/hooks/useAppData.ts, debounce the persistence side of updateData (~600ms): keep the
   optimistic setData immediate (UI must stay instant), but coalesce rapid successive changes into
   a single persistPortfolioChanges call. Track the set of changed root keys across the debounce
   window and flush them together. Ensure a final flush on page unload (beforeunload) and when the
   tab goes to background (visibilitychange) so nothing is lost.

2) In src/hooks/useAutoScheduler.ts, replace the full JSON.stringify(expenses+investments+
   recurringRules) comparison with a cheap signature (e.g. counts + last ids + a rolling hash) so
   the effect is near-free on large datasets. Behavior (which auto entries get generated) must not
   change.

Constraints: don't change financial logic; tsc clean; keep optimistic UI.
Verify: FP-0 tests pass; rapid edits produce one debounced write; auto-generated SIP/RD/recurring
entries still appear exactly as before.
```

---

## FP-3 — Make "Clear all data" safe (fix FK delete race) 🔴

```
In src/lib/dataService.ts, clearRemotePortfolioData deletes all 11 tables with Promise.all, which
can violate the transactions -> bank_accounts foreign key (no ON DELETE CASCADE) when accounts are
deleted before transactions.

Fix by deleting in dependency-safe order, sequentially:
  1. child/leaf rows: mf_lumpsum_entries, stock_holdings, transactions
  2. then: bank_accounts, mutual_funds, stock_portfolios, fixed_deposits, recurring_deposits,
     loans, recurring_rules
  3. finally: settings
Keep relying on RLS for user scoping but order the deletes so no FK is violated. Wrap in try/catch
and surface a clear error if any step fails (don't leave a half-wiped state silently).

Also update supabase/schema.sql: change transactions.from_account_id and to_account_id foreign keys
to ON DELETE SET NULL, and add an idempotent migration (drop constraint if exists / add constraint)
so existing databases can be upgraded. Document in the file that the SQL must be re-run in Supabase.
Verify: tsc clean; describe the exact delete order in a code comment.
```

---

## FP-4 — Remove or correctly wire the dead Gemini feature 🔴

```
src/services/geminiService.ts is dead code: analyzePortfolio is never imported, it reads
process.env.GEMINI_API_KEY (undefined in a Vite browser build), and shipping an LLM key to the
browser would expose it.

Do OPTION A by default (ask me only if unsure):

OPTION A (remove): delete src/services/geminiService.ts, remove @google/genai from package.json
dependencies, remove the GEMINI_API_KEY line from .env.example, and confirm nothing else imports it.

OPTION B (do this instead ONLY if I say I want AI insights): create a Supabase Edge Function
`analyze-portfolio` that takes a small finance summary and returns 3 insight strings using the
server-held key; call it from a new "Insights" card on the Dashboard with a loading + error state.
Never put the key in client code; read it from import.meta.env only for non-secret config.

Constraints: tsc clean; bundle should shrink (verify @google/genai is gone from the build if Option A).
```

---

## FP-5 — Fast daily transaction entry (mobile-first) 🟠 [feature]

```
Goal: make adding a daily expense on mobile a sub-5-second action so this app can replace my
external expense tracker. Work within the existing design system (src/components/UI.tsx, tokens in
src/index.css) and the quick-add flow in src/components/Layout.tsx.

Implement:
- Smart defaults in the add sheet: date = today; account = last-used (persist lastUsedAccountId in
  localStorage); payment method = last-used for that account; category = most-frequent recent.
- Amount-first layout: large numeric amount field focused on open; category as quick-pick chips
  (top 6 categories by recent frequency) with a "more" fallback to the full list; single account
  Select; optional note.
- Description autocomplete: suggest previous transactions by description; selecting one prefills
  category + amount + account.
- A "duplicate" action on a transaction row in src/pages/Transactions.tsx that opens the add sheet
  prefilled with that transaction and today's date.
- Keep writes optimistic (already the model) and rely on the debounced writer (FP-2).
Constraints: reuse Button/Input/Select/Sheet; don't change financial calc logic; tsc clean;
must work in the .phone-shell mobile layout AND desktop Modal. Income/expense use existing
save* helpers in utils.ts so balances update correctly.
Verify: adding a typical expense is <=4 interactions (open, amount, category chip, save).
```

---

## FP-6 — Complete the myMoney SQLite import (transfers + idempotency) 🟠 [feature]

```
src/pages/Settings.tsx already imports myMoney (Money Manager) SQLite backups via sql.js
(handleMyMoneyImport + runMappedImport). Improve it:

1) Import transfers: the INOUTCOME query filters DO_TYPE IN ('0','1') and drops DO_TYPE='3'
   (account-to-account transfers). Include DO_TYPE='3', map source and destination accounts using
   the existing account-mapping step, and emit TransferEntry objects (use the saveTransferEntry
   helper or build rows consistent with it). myMoney represents a transfer either as a single row
   with a target asset or as a paired in/out — detect and de-duplicate so a transfer isn't also
   counted as an income+expense.
2) Idempotent re-import: add columns to supabase/schema.sql -> transactions.import_source text and
   transactions.external_id text, with a unique index on (user_id, import_source, external_id).
   Set import_source='mymoney' and external_id=<myMoney uid> on imported rows so re-importing a
   newer backup updates instead of duplicating. Provide the idempotent ALTER migration.
3) Batch the write: import in chunks of ~500 rows (pairs with FP-1) to avoid payload limits.
4) Extend the existing ImportSummary dry-run to show transfer count and a per-account breakdown
   before commit.
Constraints: reuse the existing mapping UI and helpers; single-user; tsc clean.
Verify: import a sample backup; transfers appear as transfers; re-importing the same file creates
no duplicates; summary counts are correct.
```

---

## FP-7 — Correct the merged same-stock view across brokers 🟠 [feature]

```
Fix double-counting of the same stock held in different broker portfolios (e.g. INFY in Zerodha and
"Infosys Limited" in Groww). Today getCombinedStockHoldings in src/lib/utils.ts groups by
normalizeStockName, which only merges names in the hardcoded BUILTIN_MAPPINGS or the localStorage
map, so unmapped pairs show as two rows.

Implement a canonical-identity merge:
- Add `isin?: string` to the Stock type (src/types.ts) and an `isin text` column to stock_holdings
  in supabase/schema.sql (idempotent ALTER + index on (user_id, isin)). Map it in dataService both
  directions.
- Compute a canonical key per holding with this priority: ISIN -> custom ticker mapping -> normalized
  ticker (strip exchange suffixes like .NS/.BO and whitespace/case) -> normalizeStockName(name).
- Rewrite getCombinedStockHoldings to group by that canonical key. Keep the existing (correct) math:
  totalQty = Σqty, weightedAvg = Σ(qty*avg)/Σqty, totalCurrentValue = Σ(qty*currentPrice).
  For the displayed currentPrice, use the most-recently-updated holding's price rather than
  "whichever was last in the loop"; if two brokers' prices differ by >2%, flag it in the row.
- Preserve the per-portfolio breakdown already collected (portfolios[]) so I can see the split.
- The StockMappings page stays as a manual OVERRIDE mechanism, not the primary merge driver.
Constraints: don't break existing holdings that lack ISIN (fall back gracefully); tsc clean.
Verify: write/extend FP-0 tests — same ISIN across two portfolios merges to one row with summed qty;
different stocks stay separate; a name-only pair with a custom mapping still merges.
```

---

## FP-8 — Balance reconciliation (stored + recompute) 🟠

```
Account balances are stored numbers mutated by per-transaction deltas, but can drift from the sum of
transactions (e.g. after imports or failed syncs) with no way to detect it. Add a hybrid model.

- Add `openingBalance?: number` to BankAccount (src/types.ts) and an `opening_balance numeric`
  column to bank_accounts (idempotent ALTER in schema.sql), defaulting opening to the current
  balance for existing accounts (one-time backfill note).
- Add a pure helper in src/lib/utils.ts: computeAccountBalance(data, accountId) =
  openingBalance + Σ(income to it) - Σ(expense from it) + Σ(transfer in) - Σ(transfer out + fees).
- On the Bank Accounts page (src/pages/BankAccounts.tsx), show the stored balance and, when it
  differs from computeAccountBalance by more than ₹1, show a subtle "drift" indicator with a
  "Recompute" action that sets balance = computed.
- Add a global "Reconcile all accounts" action in Settings.
Constraints: do NOT silently overwrite balances — only on explicit user action; single-user; tsc
clean. Add tests for computeAccountBalance.
Verify: importing historical transactions (FP-6) then reconciling makes balances tie out.
```

---

## FP-9 — Recurring expenses: tests + upcoming view + explicit edit semantics 🟡 [feature]

```
Harden and surface recurring expenses (logic in src/lib/utils.ts: getRecurringOccurrences,
processRecurringRules, plus SIP/RD generation).

1) Centralize the auto-generated-entry identity: define constants for the id prefixes/markers
   ("sip_auto_", "rd_auto_", "rec_", "sip:", "rd:") and use them everywhere instead of inline
   string literals (isSipGeneratedExpense, isRDGeneratedExpense, etc.).
2) Add a Dashboard card "Upcoming in next 7 days" listing recurring/SIP/RD amounts due, summed,
   using the existing occurrence logic (read-only projection; don't materialize early).
3) Make rule edits explicit: when a recurring rule's amount/category changes, prompt "apply going
   forward only" vs "rewrite past auto entries" instead of silently rewriting history on regen.
Constraints: don't change which dates a frequency produces (lock with tests first); single-user;
tsc clean. Extend FP-0 recurring tests to cover the constants refactor (no behavior change).
```

---

## FP-10 — Cleanup sweep (low-risk) 🟡

```
Low-risk hygiene pass, all in one PR:
- Add a top-level React error boundary (so a render throw shows a recovery screen, not a blank page).
- Make src/lib/supabase.ts fail gracefully: instead of throwing at import when env vars are missing,
  export a flag and render a friendly "app not configured" screen in App.tsx.
- Replace alert()-based error/success messaging (Settings import/export) with a lightweight toast
  component that fits the design system (tokens in index.css).
- Remove unused dependencies: express and @types/express (no server in this repo). Confirm nothing
  imports them.
- Update stale path references "D:/Ronit/Personal/My-PortFolio" -> "Finance-Tracker" in
  PROJECT_REFERENCE.md and metadata.json.
- Re-key the settings table on user_id instead of the global id='singleton' (idempotent migration;
  keep single-user behavior).
Constraints: no behavior change beyond the above; tsc clean; FP-0 tests pass.
```

---

### Suggested execution order

`FP-0` → `FP-1` → `FP-2` → `FP-3` → `FP-4` (Phase 1: fast & safe) →
`FP-7` → `FP-6` → `FP-8` (Phase 2: trustworthy numbers) →
`FP-5` → `FP-9` (Phase 3: daily-entry UX & recurring) →
`FP-10` (cleanup).

After each prompt: review the diff, run `npm test` and `tsc --noEmit`, and commit before the next one.
