# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run preview   # preview production build locally
npm run lint      # TypeScript type check (tsc --noEmit)
npm run deploy    # build + push to GitHub Pages
```

Run `npm test` to execute the Vitest unit test suite (`src/lib/__tests__/utils.test.ts`).

## Environment Variables

Create `.env.local` (never commit real values):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Architecture

Single-user personal finance SPA. React 19 + TypeScript + Vite + Tailwind CSS (via `@tailwindcss/vite`). Supabase is the source of truth; `localStorage` is used only for offline buffering, one-time migration flag, stock-name mappings, and legacy fallback.

### Data flow

```
useAppData (src/hooks/useAppData.ts)
  └─ fetchPortfolioData / persistPortfolioChanges
       └─ dataService (src/lib/dataService.ts)    ← maps app models ↔ Supabase rows
            └─ supabase client (src/lib/supabase.ts)
```

`useAppData` is the single state owner. Pages receive `data` and call `updateData(partial)`, which merges the partial update and persists the changed slices. When offline, writes queue into `myportfolio_offline_buffer` (localStorage) and flush on reconnect.

### Key files

| File | Role |
|------|------|
| [src/App.tsx](src/App.tsx) | Shell, tab routing, unconfigured screen, error boundary root |
| [src/components/ErrorBoundary.tsx](src/components/ErrorBoundary.tsx) | Class error boundary — catches render throws, shows recovery screen |
| [src/components/Toast.tsx](src/components/Toast.tsx) | `useToastState` hook + `ToastStack` renderer — use instead of `alert()` |
| [src/components/Layout.tsx](src/components/Layout.tsx) | Sidebar, header, mobile nav, global search, sync status |
| [src/components/AuthGuard.tsx](src/components/AuthGuard.tsx) | Email/password sign-in, one-time local→Supabase migration trigger |
| [src/hooks/useAppData.ts](src/hooks/useAppData.ts) | Central state + persistence hook |
| [src/lib/dataService.ts](src/lib/dataService.ts) | Supabase read/write, offline buffer, migration helpers |
| [src/lib/supabase.ts](src/lib/supabase.ts) | Supabase client; exports `supabaseConfigured` flag (no import-time throw) |
| [src/lib/storage.ts](src/lib/storage.ts) | `normalizePortfolioData`, `INITIAL_DATA` |
| [src/lib/utils.ts](src/lib/utils.ts) | Finance helpers: net worth, grouping, scheduler logic |
| [src/lib/migrateToSupabase.ts](src/lib/migrateToSupabase.ts) | One-time legacy localStorage → Supabase migration |
| [src/hooks/useAutoScheduler.ts](src/hooks/useAutoScheduler.ts) | Auto-generates expense entries from SIPs, RDs, recurring rules |
| [src/utils/stockNormalizer.ts](src/utils/stockNormalizer.ts) | Groups holdings across brokers by normalized stock name |
| [src/types.ts](src/types.ts) | All domain types — `PortfolioData` is the root shape |
| [supabase/schema.sql](supabase/schema.sql) | Full Supabase schema, RLS policies, indexes |

### Domain model (`PortfolioData`)

```
bankAccounts           BankAccount[]
income                 IncomeEntry[]
expenses               ExpenseEntry[]
transfers              TransferEntry[]
loans                  Loan[]
recurringRules         RecurringRule[]
investments
  mutualFunds          MutualFund[]      (each has sipDetails + lumpsumEntries[])
  stockPortfolios      StockPortfolio[]  (each has holdings: Stock[])
  fd                   FixedDeposit[]
  rd                   RecurringDeposit[]
settings               { monthlyBudget, yearView, incomeCategories, expenseCategories }
```

### Supabase tables

`bank_accounts`, `transactions` (income/expense/transfer unified), `mutual_funds`, `mf_lumpsum_entries`, `stock_portfolios`, `stock_holdings`, `fixed_deposits`, `recurring_deposits`, `loans`, `recurring_rules`, `settings`. All tables have RLS scoped to `auth.uid() = user_id`.

`settings` is keyed on `user_id` (one row per user). The schema includes an idempotent migration that drops the old `id='singleton'` text primary key.

### Stock mapping

Broker CSV exports often use different names for the same stock. `stockNormalizer.ts` normalizes and groups holdings. Custom mappings are stored in `localStorage` key `stock_name_mappings` and synced into the Supabase `settings` row. The [StockMappings page](src/pages/StockMappings.tsx) is the reconciliation workspace.

### Deployment

GitHub Pages. Vite base is `/Finance-Tracker/`. GitHub Actions builds and deploys; `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set as repository secrets.

## Rules

- Supabase is always the source of truth when online; do not promote localStorage to primary storage.
- Net worth = bank balances + investments − loans. Monthly cashflow cards are separate and must not bleed into net worth.
- Auto-generated expenses (SIPs, RDs, recurring rules) carry `isAutoGenerated: true` and `autoSourceId`; treat them differently from manual entries — do not flag them as needing account assignment.
- Do not change financial calculation logic in `utils.ts` unless explicitly asked.
- Before touching schema-sensitive features, compare code against `supabase/schema.sql`.
- Path alias `@/` maps to `src/`.
- Never use `alert()` for user feedback — import `useToastState` and `ToastStack` from `src/components/Toast.tsx` instead.
- `supabase` (from `src/lib/supabase.ts`) is `null` when `supabaseConfigured` is false. Never call it outside the auth-guarded render tree.
