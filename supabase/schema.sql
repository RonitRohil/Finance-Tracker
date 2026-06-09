create extension if not exists "uuid-ossp";

create table if not exists bank_accounts (
  id text primary key,
  user_id uuid references auth.users not null,
  bank_name text not null,
  account_type text not null,
  account_number text,
  balance numeric default 0,
  notes text,
  is_cash boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists transactions (
  id text primary key,
  user_id uuid references auth.users not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  date date not null,
  amount numeric not null,
  description text,
  category text,
  source text,
  from_account_id text references bank_accounts(id) on delete set null,
  from_account_name text,
  to_account_id text references bank_accounts(id) on delete set null,
  to_account_name text,
  payment_method text,
  fees numeric default 0,
  is_auto_generated boolean default false,
  auto_source_id text,
  recurring_rule_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mutual_funds (
  id text primary key,
  user_id uuid references auth.users not null,
  fund_name text not null,
  amc text,
  category text,
  current_value numeric default 0,
  sip_monthly_amount numeric,
  sip_start_date date,
  sip_status text default 'Active',
  sip_from_account_id text references bank_accounts(id),
  sip_from_account_name text,
  sip_payment_method text,
  sip_stopped_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mf_lumpsum_entries (
  id text primary key,
  user_id uuid references auth.users not null,
  fund_id text references mutual_funds(id) on delete cascade,
  date date not null,
  amount numeric not null,
  created_at timestamptz default now()
);

create table if not exists stock_portfolios (
  id text primary key,
  user_id uuid references auth.users not null,
  name text not null,
  owner_name text,
  broker text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stock_holdings (
  id text primary key,
  user_id uuid references auth.users not null,
  portfolio_id text references stock_portfolios(id) on delete cascade,
  company_name text not null,
  ticker text,
  quantity numeric not null,
  avg_buy_price numeric default 0,
  current_price numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists fixed_deposits (
  id text primary key,
  user_id uuid references auth.users not null,
  bank_name text not null,
  principal numeric not null,
  interest_rate numeric not null,
  start_date date not null,
  maturity_date date not null,
  from_account_id text references bank_accounts(id),
  from_account_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists recurring_deposits (
  id text primary key,
  user_id uuid references auth.users not null,
  bank_name text not null,
  monthly_deposit numeric not null,
  interest_rate numeric not null,
  start_date date not null,
  maturity_date date not null,
  from_account_id text references bank_accounts(id),
  from_account_name text,
  payment_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists loans (
  id text primary key,
  user_id uuid references auth.users not null,
  lender_name text not null,
  loan_type text,
  principal_amount numeric,
  outstanding_balance numeric,
  emi_amount numeric,
  interest_rate numeric,
  emi_day integer,
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists recurring_rules (
  id text primary key,
  user_id uuid references auth.users not null,
  name text not null,
  amount numeric not null,
  category text,
  payment_method text,
  from_account_id text,
  from_account_name text,
  description text,
  frequency text not null,
  day_of_month integer,
  day_of_week integer,
  month_of_year integer,
  start_date date not null,
  end_date date,
  is_active boolean default true,
  last_processed_month text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists settings (
  id text primary key default 'singleton',
  user_id uuid references auth.users not null,
  monthly_budget numeric default 0,
  financial_year_mode boolean default false,
  income_categories jsonb default '[]'::jsonb,
  expense_categories jsonb default '[]'::jsonb,
  stock_name_mappings jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table mutual_funds add column if not exists sip_from_account_id text references bank_accounts(id);
alter table mutual_funds add column if not exists sip_from_account_name text;
alter table mutual_funds add column if not exists sip_payment_method text;
alter table mutual_funds add column if not exists sip_stopped_date date;

alter table fixed_deposits add column if not exists from_account_id text references bank_accounts(id);
alter table fixed_deposits add column if not exists from_account_name text;

alter table recurring_deposits add column if not exists from_account_id text references bank_accounts(id);
alter table recurring_deposits add column if not exists from_account_name text;
alter table recurring_deposits add column if not exists payment_method text;

alter table recurring_rules add column if not exists last_processed_month text;
alter table settings add column if not exists income_categories jsonb default '[]'::jsonb;
alter table settings add column if not exists expense_categories jsonb default '[]'::jsonb;

alter table bank_accounts enable row level security;
alter table transactions enable row level security;
alter table mutual_funds enable row level security;
alter table mf_lumpsum_entries enable row level security;
alter table stock_portfolios enable row level security;
alter table stock_holdings enable row level security;
alter table fixed_deposits enable row level security;
alter table recurring_deposits enable row level security;
alter table loans enable row level security;
alter table recurring_rules enable row level security;
alter table settings enable row level security;

drop policy if exists "owner only" on bank_accounts;
drop policy if exists "owner only" on transactions;
drop policy if exists "owner only" on mutual_funds;
drop policy if exists "owner only" on mf_lumpsum_entries;
drop policy if exists "owner only" on stock_portfolios;
drop policy if exists "owner only" on stock_holdings;
drop policy if exists "owner only" on fixed_deposits;
drop policy if exists "owner only" on recurring_deposits;
drop policy if exists "owner only" on loans;
drop policy if exists "owner only" on recurring_rules;
drop policy if exists "owner only" on settings;

create policy "owner only" on bank_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on mutual_funds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on mf_lumpsum_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on stock_portfolios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on stock_holdings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on fixed_deposits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on recurring_deposits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on loans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner only" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_transactions_user_date on transactions(user_id, date desc);
create index if not exists idx_transactions_type on transactions(user_id, type);
create index if not exists idx_stock_holdings_portfolio on stock_holdings(portfolio_id);
create index if not exists idx_mf_lumpsum_fund on mf_lumpsum_entries(fund_id);

-- ─── Migration: transactions → bank_accounts FKs now ON DELETE SET NULL ───────
-- The CREATE TABLE above already defines the correct ON DELETE SET NULL behaviour
-- for new databases.  Existing databases need this migration applied once in the
-- Supabase SQL Editor (Dashboard → SQL Editor → paste and run).
--
-- Why: clearRemotePortfolioData deletes bank_accounts after all referencing rows
-- have been removed, but any other code path that deletes a single bank account
-- while transactions still reference it would have raised a FK violation under
-- the old RESTRICT default.  SET NULL is the safe semantic: the account reference
-- becomes NULL (already a nullable column) rather than blocking the delete.

alter table transactions
  drop constraint if exists transactions_from_account_id_fkey;
alter table transactions
  add constraint transactions_from_account_id_fkey
    foreign key (from_account_id) references bank_accounts(id) on delete set null;

alter table transactions
  drop constraint if exists transactions_to_account_id_fkey;
alter table transactions
  add constraint transactions_to_account_id_fkey
    foreign key (to_account_id) references bank_accounts(id) on delete set null;
