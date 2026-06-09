# Finance-Tracker

Personal finance SPA for tracking bank accounts, transactions, investments, loans, recurring rules, and stock mappings across devices.

Uses Supabase as the primary backend. `localStorage` is kept only for offline buffering, migration support, and local stock-name mappings.

## Project Reference

For chatbot or contributor handoff, read:

- [PROJECT_REFERENCE.md](./PROJECT_REFERENCE.md)

That file explains the app structure, key files, data flow, Supabase schema, stock mapping behavior, and project rules.

## Features

- bank accounts with balances and cash support
- income, expenses, and transfers
- mutual funds with SIPs and lumpsum entries
- stock portfolios with CSV import and stock normalization
- dedicated stock mapping manager for cross-portfolio grouping
- fixed deposits and recurring deposits
- loans and EMI tracking
- recurring rules and auto-generated expenses
- dashboard with net worth, monthly cash flow, warnings, and category snapshots
- Supabase auth and cloud sync
- offline write buffering with reconnect flush
- graceful "app not configured" screen when env vars are absent
- toast notifications for import/export feedback (no browser alerts)
- top-level error boundary with recovery screen

## Tech Stack

- React
- TypeScript
- Vite
- Supabase
- Lucide React
- Motion
- Recharts

## Local Setup

### Prerequisites

- Node.js 18+
- npm
- a Supabase project

### Install

```bash
npm install
```

### Environment Variables

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Do not commit real keys.

### Supabase Schema

Run the SQL in:

- [supabase/schema.sql](./supabase/schema.sql)

This creates the required tables, RLS policies, and indexes.

### Start Development Server

```bash
npm run dev
```

### Other Commands

```bash
npm run lint
npm run build
npm run preview
```

## Authentication

- Supabase email/password auth is used
- this is a single-owner app
- no public sign-up flow is required

The owner account should be created in Supabase Auth ahead of time.

## Data Model Overview

The main app shape is `PortfolioData` in:

- [src/types.ts](./src/types.ts)

Main domains:

- `bankAccounts`
- `income`
- `expenses`
- `transfers`
- `investments`
- `loans`
- `recurringRules`
- `settings`

## Key Files

- [src/App.tsx](./src/App.tsx)
  app shell, page routing, unconfigured screen
- [src/components/ErrorBoundary.tsx](./src/components/ErrorBoundary.tsx)
  top-level render error recovery
- [src/components/Toast.tsx](./src/components/Toast.tsx)
  lightweight toast notifications (`useToastState` + `ToastStack`)
- [src/hooks/useAppData.ts](./src/hooks/useAppData.ts)
  main state and persistence hook
- [src/lib/dataService.ts](./src/lib/dataService.ts)
  Supabase read/write mapping and offline buffering
- [src/lib/supabase.ts](./src/lib/supabase.ts)
  Supabase client; exports `supabaseConfigured` flag
- [src/lib/utils.ts](./src/lib/utils.ts)
  finance helpers, grouping, and scheduler logic
- [src/pages/Investments.tsx](./src/pages/Investments.tsx)
  mutual funds, stocks, FDs, and RDs
- [src/pages/StockMappings.tsx](./src/pages/StockMappings.tsx)
  stock reconciliation and grouping workspace
- [src/components/AuthGuard.tsx](./src/components/AuthGuard.tsx)
  auth gate and migration trigger

## Deployment

The app is set up for GitHub Pages deployment.

If using GitHub Actions, add these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Notes

- Net worth should remain separate from monthly cash flow.
- SIP and RD auto-generated expenses depend on schedule data and linked source accounts.
- Stock mapping is an important workflow because broker exports often name the same stock differently.
- If synced data looks wrong, check both Supabase env vars and whether the latest SQL has been applied.
