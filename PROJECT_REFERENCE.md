# My Portfolio Project Reference

This file is a quick handoff document for any chatbot, coding assistant, or future contributor working in this repository.

## What This Project Is

`My Portfolio` is a personal finance SPA built with React, TypeScript, Vite, and Tailwind-style utility classes.

It is designed for a single owner and tracks:

- bank accounts
- income, expenses, and transfers
- mutual funds with SIPs and lumpsum entries
- stock portfolios and stock-name normalization/mappings
- fixed deposits and recurring deposits
- loans and EMI tracking
- recurring rules and auto-generated transactions

The app now uses Supabase as the primary database. `localStorage` is only used for:

- offline write buffering
- one-time migration flags
- custom stock-name mappings
- legacy fallback data when Supabase is unavailable

## Core Product Rules

- Single-user app only. No teams, sharing, or multi-user UI.
- Authentication is required through Supabase Auth.
- Supabase is the source of truth when online.
- Offline writes are buffered locally and flushed when the device reconnects.
- Do not change financial calculation logic unless explicitly requested.
- Net worth must remain:
  bank balances + investments - loans
- Monthly income/expense/cashflow cards are current-month only and should not be mixed into net worth.

## Current Tech Stack

- React 19
- TypeScript
- Vite
- `@supabase/supabase-js`
- `lucide-react`
- `motion`
- `recharts`

## App Entry and Main Structure

- [src/App.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/App.tsx)
  App shell, tab routing, auth guard usage, and page rendering.
- [src/components/Layout.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/components/Layout.tsx)
  Sidebar, header, mobile nav, global search, sync status, sign-out.
- [src/components/AuthGuard.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/components/AuthGuard.tsx)
  Email/password sign-in, session tracking, one-time local-to-Supabase migration trigger.
- [src/hooks/useAppData.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/hooks/useAppData.ts)
  Main state hook. Loads data, persists partial updates, handles online/offline sync.

## Important Pages

- [src/pages/Dashboard.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Dashboard.tsx)
  Financial overview, summaries, warnings, category snapshot.
- [src/pages/BankAccounts.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/BankAccounts.tsx)
  Bank and cash accounts.
- [src/pages/Transactions.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Transactions.tsx)
  Income, expense, transfer history and filtering.
- [src/pages/Investments.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Investments.tsx)
  Mutual funds, stocks, FDs, RDs, portfolio import, stock-level summaries and sorting.
- [src/pages/StockMappings.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/StockMappings.tsx)
  Dedicated stock reconciliation page for cross-portfolio alias grouping and custom mappings.
- [src/pages/LoansTracker.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/LoansTracker.tsx)
  Loan and EMI tracking.
- [src/pages/Settings.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Settings.tsx)
  Data management, category manager, import/export, destructive actions.

## Data Layer

### Primary client

- [src/lib/supabase.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/supabase.ts)
  Creates the Supabase client from:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Persistence and sync

- [src/lib/dataService.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/dataService.ts)
  Maps app models to Supabase rows and back.

Responsibilities:

- fetch all portfolio data from Supabase
- persist changed slices of data
- buffer writes when offline
- flush offline writes when back online
- migrate legacy local storage shape into the current normalized shape
- sync `stock_name_mappings` from settings row into local storage

### Local storage keys still in use

- `myportfolio_offline_buffer`
- `myportfolio_migrated_to_supabase`
- `stock_name_mappings`
- `myportfolio_data`
  legacy fallback and migration source only

### Main schema

See [supabase/schema.sql](/d:/Ronit/Personal/projects/Finance-Tracker/supabase/schema.sql).

Current tables:

- `bank_accounts`
- `transactions`
- `mutual_funds`
- `mf_lumpsum_entries`
- `stock_portfolios`
- `stock_holdings`
- `fixed_deposits`
- `recurring_deposits`
- `loans`
- `recurring_rules`
- `settings`

RLS is enabled and scoped to `auth.uid() = user_id`.

## Auto-Generated Finance Logic

Most calculation and scheduling helpers live in:

- [src/lib/utils.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/utils.ts)

Important behavior already implemented:

- SIP deductions auto-create expense entries
- RD deductions auto-create expense entries
- recurring rules auto-create expense entries
- SIP/RD auto-generated entries should not be treated as manual “needs account assignment” items
- SIPs and RDs store a source account and payment method
- auto-generated deductions use the schedule’s linked source account
- older generated entries are refreshed from schedule data when regenerated

Related scheduler hook:

- [src/hooks/useAutoScheduler.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/hooks/useAutoScheduler.ts)

## Stock Mapping and Grouping

Stock name reconciliation is important in this project because imports from Groww, Zerodha, and other brokers may use different names for the same stock.

Key files:

- [src/utils/stockNormalizer.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/utils/stockNormalizer.ts)
- [src/pages/StockMappings.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/StockMappings.tsx)
- [src/pages/Investments.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Investments.tsx)

Current behavior:

- holdings are normalized and grouped by stock name/ticker
- custom mappings can be added and removed
- a dedicated Stock Mappings page shows:
  - portfolio source lists
  - grouped stock report
  - alias review groups
  - top totals for invested/current value
  - draft-check panel while creating mappings
- the Investments page includes stock summary cards and sorting in combined holdings

## Auth and Migration Flow

On sign-in:

1. Supabase session is restored or created.
2. If migration flag is absent, legacy `myportfolio_data` is migrated into Supabase.
3. App data is fetched from Supabase into the normalized `PortfolioData` shape.
4. Future updates are persisted slice-by-slice through `useAppData`.

Migration helper:

- [src/lib/migrateToSupabase.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/migrateToSupabase.ts)

## Environment Variables

Expected in `.env.local` and CI:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Do not commit real credentials.

## Build and Scripts

From [package.json](/d:/Ronit/Personal/projects/Finance-Tracker/package.json):

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
- `npm run deploy`

## Deployment Notes

- Vite is configured for GitHub Pages deployment.
- GitHub Actions should provide:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- If deployment or runtime data loading fails, verify env vars and Supabase schema first.

## Conventions for Future Bots

- Preserve current UI patterns unless the user explicitly wants redesign.
- Do not reintroduce multi-user concepts.
- Keep Supabase as primary storage.
- Keep `localStorage` limited to offline buffering, migration, and stock mapping support.
- When fixing dashboard labels, summaries, or cards, avoid touching calculation logic unless asked.
- For stock work, prefer grouped and portfolio-aware reporting over flat mapping dumps.
- For financial edits, check both data model impact and account-balance side effects.
- Before changing schema-sensitive features, compare code with [supabase/schema.sql](/d:/Ronit/Personal/projects/Finance-Tracker/supabase/schema.sql).

## Good First Files To Read

If you are a chatbot picking up work, start here:

1. [src/App.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/App.tsx)
2. [src/hooks/useAppData.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/hooks/useAppData.ts)
3. [src/lib/dataService.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/dataService.ts)
4. [src/lib/utils.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/lib/utils.ts)
5. [src/types.ts](/d:/Ronit/Personal/projects/Finance-Tracker/src/types.ts)
6. [src/pages/Investments.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/Investments.tsx)
7. [src/pages/StockMappings.tsx](/d:/Ronit/Personal/projects/Finance-Tracker/src/pages/StockMappings.tsx)
8. [supabase/schema.sql](/d:/Ronit/Personal/projects/Finance-Tracker/supabase/schema.sql)
