# System Design — Finance Tracker

_Detailed design of the data model, sync engine, and the four feature designs you asked to prioritize: fast daily entry, recurring expenses, myMoney SQLite import, multi-broker stock portfolios, and the merged same-stock view. This is the "how it works now + how it should work" reference._

---

## 1. Data model

### In-memory model — `PortfolioData` (`src/types.ts`)

One nested object held by `useAppData`:

```
PortfolioData
├─ bankAccounts: BankAccount[]            // includes the synthetic acc_cash
├─ transfers:   TransferEntry[]
├─ income:      IncomeEntry[]
├─ expenses:    ExpenseEntry[]            // includes auto-generated SIP/RD/recurring
├─ loans:       Loan[]
├─ recurringRules: RecurringRule[]
├─ investments: { mutualFunds[], stockPortfolios[], fd[], rd[] }
└─ settings:    { monthlyBudget, yearView, incomeCategories[], expenseCategories[] }
```

### Persisted model — Supabase (`supabase/schema.sql`)

11 tables, all keyed by `id text` + `user_id uuid`, all under `"owner only"` RLS:

```
bank_accounts ──< transactions (type ∈ income|expense|transfer)
              └─< fixed_deposits, recurring_deposits, mutual_funds (sip_from_account)
stock_portfolios ──< stock_holdings        (ON DELETE CASCADE)
mutual_funds     ──< mf_lumpsum_entries    (ON DELETE CASCADE)
loans, recurring_rules, settings (1 row, id='singleton')
```

**Mapping notes & gaps:**
- Income/expense/transfer all collapse into `transactions`, discriminated by `type`. Income stores `source` (not `category`); expense stores `category` + `payment_method`; transfer stores both account sides + `fees`.
- `transactions.from_account_id/to_account_id` reference `bank_accounts(id)` with **no cascade** → the parallel-delete race in code-review H3.
- Stock holdings carry no ISIN column — the merge problem in §6 starts here.
- `settings` is one global-keyed row holding budget, year view, category lists, and `stock_name_mappings` (mirrored from localStorage).

### Recommended schema additions (for the goals below)

```sql
-- stock identity (enables correct multi-broker merge, §6)
alter table stock_holdings add column if not exists isin text;
create index if not exists idx_holdings_isin on stock_holdings(user_id, isin);

-- import provenance (idempotent re-imports, §5)
alter table transactions add column if not exists import_source text;   -- 'mymoney' | 'csv' | null
alter table transactions add column if not exists external_id text;     -- source row uid
create unique index if not exists uq_tx_external
  on transactions(user_id, import_source, external_id) where external_id is not null;

-- safety: fix the delete race (code-review H3)
alter table transactions
  drop constraint if exists transactions_from_account_id_fkey,
  add  constraint transactions_from_account_id_fkey
       foreign key (from_account_id) references bank_accounts(id) on delete set null;
-- (repeat for to_account_id)
```

---

## 2. Sync engine (current) and its redesign

### Current flow

```
user edits → page calls updateData(partial)
  → mergePortfolioData (normalize)        [useAppData]
  → setData (optimistic, instant)
  → persistPortfolioChanges(prev, next, changedKeys)   [dataService]
       per changed slice: map ALL rows → upsert ALL → delete removed ids
  → useAutoScheduler sees new data → JSON.stringify diff → maybe updateData again
```

Two structural problems (detailed in code-review H1/H2): the writer is **O(total history)** per edit, and there's **no debounce**, so the scheduler + writer can ping-pong.

### Redesigned write path

```
updateData(partial)
  → setData (optimistic)                          ← unchanged, keeps UI instant
  → enqueue dirty slice
  → debounce 600ms → flushWrites()
        for each dirty slice:
          rows = map(next)
          changed = rows where shallow-hash(row) ≠ lastWritten[id]   ← diff, not all
          upsert(changed);  delete(diffIds(prev,next))
          lastWritten = merge(changed)
```

Key ideas:
- **Diff before write.** Keep a `lastWrittenHash` map per table; only upsert rows whose mapped form actually changed. Turns a daily expense add from "2,000 rows" into "1 row."
- **Debounce.** Collapse rapid edits (typing an amount, toggling fields) into one write.
- **Chunk bulk writes.** Imports upsert in batches of ~500 to stay under payload limits.
- **Cheaper scheduler signature.** Replace `JSON.stringify(all)` with `${expenses.length}:${lastExpenseId}:${recurringRules.length}:...` or a rolling hash, so the effect is near-free on large datasets.

This is the highest-leverage change in the whole system; everything daily-driver depends on it. Prompt: `fix-prompts.md` FP-1/FP-2.

---

## 3. Daily transaction entry (the core daily-driver surface)

**Goal:** replace your external app, so adding an expense on your phone must be a sub-5-second, low-friction action.

**Current:** quick-add lives in `Layout.tsx` (mobile bottom nav → `Sheet`). It works but doesn't yet minimize taps for the common case.

**Design targets:**
1. **Smart defaults:** date = today; account = last-used (persist `lastUsedAccountId`); payment method = last-used per account; category = most-frequent or recent.
2. **One-screen add:** amount-first numeric keypad, category as quick chips (top 6 by recent frequency), account as a single dropdown, optional note. No scrolling.
3. **Recall / autocomplete:** typing a description suggests previous transactions (payee → category + amount) so repeat expenses are one tap.
4. **Immediate persistence, no spinner blocking:** optimistic add (already the model) + debounced write (§2).
5. **Edit/duplicate from the list:** "duplicate" a prior transaction as a new entry with today's date.

**Acceptance:** adding a typical expense = open sheet → type amount → tap category chip → save (≤4 interactions). Prompt: FP-5.

---

## 4. Recurring expenses

**Current (`utils.ts`):** `RecurringRule` supports 13 frequencies (`daily`…`yearly`, plus `weekdays`, `weekends`, `endofmonth`, `everyNmonths`). `getRecurringOccurrences` expands a rule into dates; `processRecurringRules` materializes them as auto-generated expenses with deterministic ids `rec_{ruleId}_{date}`. SIP and RD deductions follow the same pattern (`sip_auto_*`, `rd_auto_*`).

**Strengths:** deterministic ids make regeneration idempotent; auto entries are excluded from "needs account" warnings.

**Design improvements:**
- **Test the expansion logic first** (TD-10/TD-11) — it's dense and currently unguarded. Lock behavior for each frequency before touching it.
- **Centralize the auto-id scheme** as constants (`AUTO_PREFIX.recurring`, etc.) so the "is this auto-generated?" checks can't drift (TD-9).
- **Surface upcoming recurrences** on the Dashboard ("₹X due in next 7 days") — turns rules from invisible background entries into a planning tool.
- **Edit-with-history semantics:** editing a rule's amount should let you choose "apply going forward" vs "rewrite past auto entries." Today regeneration refreshes generated entries from current schedule data, which silently rewrites history. Make that choice explicit.

Prompt: FP-9 (tests + upcoming view).

---

## 5. Import pipeline — myMoney SQLite (and CSV)

**Current (`Settings.tsx`):** already implemented with `sql.js` (WASM). `handleMyMoneyImport` reads the `.db`/`.sqlite` backup, queries `ASSETS`, `ZCATEGORY`, `INOUTCOME`, builds an **account-mapping step** (map each myMoney account → an app account or "skip"), then `runMappedImport` converts rows to income/expenses and merges them.

**Schema observed in the myMoney DB:**
- `ASSETS(uid, NIC_NAME)` — accounts.
- `ZCATEGORY(uid, NAME, TYPE, pUid, C_IS_DEL)` — categories (TYPE 1=expense, 2=income), hierarchical via `pUid`.
- `INOUTCOME(uid, assetUid, ctgUid, ZCONTENT, ZDATE, DO_TYPE, ZMONEY, ASSET_NIC, CATEGORY_NAME, IS_DEL)` — transactions. `DO_TYPE`: `0`=income, `1`=expense, `3`=transfer. `ZDATE` epoch (sec or ms).

**Gaps to close:**
1. **Transfers dropped.** Query filters `DO_TYPE IN ('0','1')`. Add `DO_TYPE='3'` and emit `TransferEntry`s (transfers in myMoney appear as paired rows or a row with a target asset — map source/target accounts via the same mapping step).
2. **No balance reconciliation.** Imports don't touch balances. Decide the model (see §7): if balances are "current snapshot," importing historical facts without touching balance is fine **but** must be stated in the UI; if you want balances derived, recompute after import.
3. **Idempotent re-import.** Ids are `mymoney_{uid}` (good), but add the `external_id`/`import_source` columns (§1) and upsert on conflict so re-importing a newer backup updates rather than duplicates.
4. **Batch the write** (§2) — a full export can be thousands of rows.
5. **Dry-run summary** already exists (`ImportSummary`) — extend it to show transfer count and a per-account breakdown before commit.

Prompt: FP-6.

---

## 6. Multi-broker stock portfolios + merged same-stock view

This is the area you explicitly want corrected.

### Current model
- `StockPortfolio { ownerName, broker: Groww|Zerodha|Upstox|Other, holdings: Stock[] }`.
- `Stock { companyName, ticker, quantity, avgBuyPrice, currentPrice }` — **no ISIN.**
- CSV import exists for holdings; `StockMappings.tsx` lets you map a ticker → canonical name.
- `getCombinedStockHoldings` (`utils.ts`) groups holdings across all portfolios by `normalizeStockName(companyName)`.

### Why the merge is wrong today
Grouping keys on the **display name** resolved through `stockNormalizer`, which only knows names in `BUILTIN_MAPPINGS` (20 hardcoded stocks) or the user's localStorage map. So:
- Zerodha `INFY` and Groww `Infosys Limited` merge **only** because that exact pair is hardcoded.
- Any stock not in the map, or named slightly differently by two brokers, shows as **two rows** → positions double-counted, wrong totals.
- `currentPrice: holding.currentPrice || existing.currentPrice` keeps whichever broker's price loaded last; two stale prices can disagree.

### Redesigned identity & merge
Resolve a **canonical key** per holding with a priority chain:

```
canonicalKey(holding) =
  holding.isin                       // 1. ISIN — globally unique, broker-independent (best)
  ?? customMapping[ticker]           // 2. user override
  ?? normalizedTicker(holding.ticker)// 3. ticker, stripped of exchange suffixes (.NS/.BO)
  ?? normalizeStockName(name)        // 4. name (last resort, current behavior)
```

- **Add ISIN** to `Stock`/`stock_holdings` (§1) and capture it on import — both Zerodha and Groww holdings exports include ISIN, which makes the merge exact and removes reliance on the hardcoded map entirely.
- **Merge math** (keep what's correct): `totalQty = Σqty`, `weightedAvg = Σ(qty·avg)/Σqty`, `currentValue = Σ(qty·currentPrice)`. For the **display** `currentPrice`, use the most-recently-updated holding's price (track an `updatedAt`) rather than "whichever was last in the loop," and flag when broker prices disagree by >X%.
- **Keep per-broker breakdown** in the merged row (already collected as `portfolios[]`) so you can see "30 INFY @ Zerodha + 20 @ Groww."
- **Mappings become overrides, not the mechanism** — the manual StockMappings page still helps for odd cases, but isn't load-bearing.

Prompt: FP-7 (ISIN + canonical key + corrected merge).

### Broker import (next step beyond merge)
Start **file-based** (fits the serverless architecture, no secrets): a per-broker CSV adapter that maps each broker's holdings export columns → `Stock` (incl. ISIN). Zerodha Console and Groww both export holdings CSVs. A live-API path (Kite/Groww APIs) would require an Edge Function to hold tokens — defer unless you want intraday prices.

---

## 7. Cross-cutting decision: are balances stored or derived?

Several features (import, transfers, reconciliation) hinge on one unanswered question.

| Option | How it works | Pros | Cons |
|--------|--------------|------|------|
| **A. Stored (current)** | `balance` is a number, mutated by deltas on each tx. | Simple; you can enter "today's balance" directly. | Drifts when a delta is missed (import, failed sync). No source of truth. |
| **B. Derived** | `balance = openingBalance + Σ(transactions)`. | Always consistent; import "just works." | Requires an opening balance per account; recompute cost (cacheable). |
| **C. Hybrid (recommended)** | Store balance for speed, but keep `openingBalance` and a **"recompute & reconcile"** action that resets `balance = opening + Σtx` and flags drift. | Fast + auditable; surfaces bugs instead of hiding them. | A little more code. |

Recommendation: **C.** It directly fixes code-review M4/TD-6 and makes the import (§5) safe. Prompt: FP-8.

---

## 8. Putting it together — sequence for "add expense on phone, see it on laptop"

```
Phone: tap add → optimistic insert into expenses[] → debounce 600ms
     → upsert 1 row (diffed) to transactions → updated_at set
Laptop: open app → fetchPortfolioData() pulls all tables → sees the new row
```

(No realtime today — laptop needs a load/refresh. Add Supabase Realtime later if you want it live; architecture.md §5.4.)

---

All prompts referenced (FP-#) are in [`fix-prompts.md`](./fix-prompts.md). Specific defects are in [`code-review.md`](./code-review.md); debt scoring in [`tech-debt.md`](./tech-debt.md).
