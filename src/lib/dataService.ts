import {
  BankAccount,
  CategoryDefinition,
  ExpenseEntry,
  FixedDeposit,
  IncomeEntry,
  Loan,
  MutualFund,
  PortfolioData,
  RecurringDeposit,
  RecurringRule,
  Stock,
  StockPortfolio,
  TransferEntry,
} from "../types";
import { normalizePortfolioData } from "./storage";
import { supabase } from "./supabase";

export const LEGACY_STORAGE_KEY = "myportfolio_data";
export const OFFLINE_BUFFER_KEY = "myportfolio_offline_buffer";
export const MIGRATION_FLAG_KEY = "myportfolio_migrated_to_supabase";

type TransactionRow = {
  id: string;
  user_id: string;
  type: "income" | "expense" | "transfer";
  date: string;
  amount: number;
  description: string | null;
  category: string | null;
  source: string | null;
  from_account_id: string | null;
  from_account_name: string | null;
  to_account_id: string | null;
  to_account_name: string | null;
  payment_method: string | null;
  fees: number | null;
  is_auto_generated: boolean | null;
  auto_source_id: string | null;
  recurring_rule_id: string | null;
  import_source: string | null;
  external_id: string | null;
  created_at?: string;
  updated_at?: string;
};

type BankAccountRow = {
  id: string;
  user_id: string;
  bank_name: string;
  account_type: string;
  account_number: string | null;
  balance: number | null;
  opening_balance?: number | null;
  notes: string | null;
  is_cash: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type MutualFundRow = {
  id: string;
  user_id: string;
  fund_name: string;
  amc: string | null;
  category: string | null;
  current_value: number | null;
  sip_monthly_amount: number | null;
  sip_start_date: string | null;
  sip_status: string | null;
  sip_from_account_id?: string | null;
  sip_from_account_name?: string | null;
  sip_payment_method?: string | null;
  sip_stopped_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

type MFLumpsumRow = {
  id: string;
  user_id: string;
  fund_id: string;
  date: string;
  amount: number;
  created_at?: string;
};

type StockPortfolioRow = {
  id: string;
  user_id: string;
  name: string;
  owner_name: string | null;
  broker: string | null;
  created_at?: string;
  updated_at?: string;
};

type StockHoldingRow = {
  id: string;
  user_id: string;
  portfolio_id: string;
  company_name: string;
  ticker: string | null;
  quantity: number;
  avg_buy_price: number | null;
  current_price: number | null;
  created_at?: string;
  updated_at?: string;
};

type FixedDepositRow = {
  id: string;
  user_id: string;
  bank_name: string;
  principal: number;
  interest_rate: number;
  start_date: string;
  maturity_date: string;
  from_account_id?: string | null;
  from_account_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

type RecurringDepositRow = {
  id: string;
  user_id: string;
  bank_name: string;
  monthly_deposit: number;
  interest_rate: number;
  start_date: string;
  maturity_date: string;
  from_account_id?: string | null;
  from_account_name?: string | null;
  payment_method?: string | null;
  created_at?: string;
  updated_at?: string;
};

type LoanRow = {
  id: string;
  user_id: string;
  lender_name: string;
  loan_type: string | null;
  principal_amount: number | null;
  outstanding_balance: number | null;
  emi_amount: number | null;
  interest_rate: number | null;
  emi_day: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
};

type RecurringRuleRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category: string | null;
  payment_method: string | null;
  from_account_id: string | null;
  from_account_name: string | null;
  description: string | null;
  frequency: string;
  day_of_month: number | null;
  day_of_week: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean | null;
  last_processed_month?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SettingsRow = {
  user_id: string;
  monthly_budget: number | null;
  financial_year_mode: boolean | null;
  income_categories?: CategoryDefinition[] | null;
  expense_categories?: CategoryDefinition[] | null;
  stock_name_mappings?: Record<string, string> | null;
  updated_at?: string;
};

interface BufferedWrite {
  id: string;
  type: "upsert" | "delete";
  table: string;
  row?: Record<string, unknown>;
  timestamp: number;
}

type RootKey = keyof PortfolioData;

const TABLES = {
  bankAccounts: "bank_accounts",
  transactions: "transactions",
  mutualFunds: "mutual_funds",
  mfLumpsumEntries: "mf_lumpsum_entries",
  stockPortfolios: "stock_portfolios",
  stockHoldings: "stock_holdings",
  fixedDeposits: "fixed_deposits",
  recurringDeposits: "recurring_deposits",
  loans: "loans",
  recurringRules: "recurring_rules",
  settings: "settings",
} as const;

function isLikelyOfflineError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    !navigator.onLine ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("failed to fetch")
  );
}

function getBufferedWrites() {
  try {
    return JSON.parse(
      localStorage.getItem(OFFLINE_BUFFER_KEY) || "[]",
    ) as BufferedWrite[];
  } catch {
    return [];
  }
}

function saveBufferedWrites(writes: BufferedWrite[]) {
  localStorage.setItem(OFFLINE_BUFFER_KEY, JSON.stringify(writes));
}

export function bufferOfflineWrite(write: Omit<BufferedWrite, "timestamp">) {
  const buffer = getBufferedWrites();
  buffer.push({ ...write, timestamp: Date.now() });
  saveBufferedWrites(buffer);
}

async function getUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function fetchTable<T>(table: string) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data || []) as T[];
}

async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 500,
) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + chunkSize));
    if (error) throw error;
  }
}

async function deleteRows(table: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw error;
}

async function safeUpsertRows(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  if (!navigator.onLine) {
    rows.forEach((row) =>
      bufferOfflineWrite({ id: String(row.id), type: "upsert", table, row }),
    );
    return;
  }

  try {
    await upsertRows(table, rows);
  } catch (error) {
    if (!isLikelyOfflineError(error)) throw error;
    rows.forEach((row) =>
      bufferOfflineWrite({ id: String(row.id), type: "upsert", table, row }),
    );
  }
}

async function safeDeleteRows(table: string, ids: string[]) {
  if (ids.length === 0) return;

  if (!navigator.onLine) {
    ids.forEach((id) => bufferOfflineWrite({ id, type: "delete", table }));
    return;
  }

  try {
    await deleteRows(table, ids);
  } catch (error) {
    if (!isLikelyOfflineError(error)) throw error;
    ids.forEach((id) => bufferOfflineWrite({ id, type: "delete", table }));
  }
}

export async function flushOfflineBuffer() {
  const buffer = getBufferedWrites();
  if (buffer.length === 0) return;

  const remaining: BufferedWrite[] = [];

  for (const write of buffer) {
    try {
      if (write.type === "upsert" && write.row) {
        await upsertRows(write.table, [write.row]);
      } else if (write.type === "delete") {
        await deleteRows(write.table, [write.id]);
      }
    } catch (error) {
      if (!isLikelyOfflineError(error)) throw error;
      remaining.push(write);
    }
  }

  saveBufferedWrites(remaining);
}

function diffIds<T extends { id: string }>(previous: T[], next: T[]) {
  const nextIds = new Set(next.map((item) => item.id));
  return previous
    .filter((item) => !nextIds.has(item.id))
    .map((item) => item.id);
}

// ─── Row-diff cache ────────────────────────────────────────────────────────────
// Per-table map of id → stable row hash (updated_at / created_at excluded, keys
// sorted) so persistPortfolioChanges can skip rows unchanged since the last fetch
// or write.
const rowSignatureCache = new Map<string, Map<string, string>>();

function rowSignature(row: object): string {
  const {
    updated_at: _u,
    created_at: _c,
    ...stable
  } = row as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(stable).sort()) sorted[k] = stable[k];
  return JSON.stringify(sorted);
}

function getTableCache(table: string): Map<string, string> {
  let m = rowSignatureCache.get(table);
  if (!m) {
    m = new Map();
    rowSignatureCache.set(table, m);
  }
  return m;
}

function seedTableCache<T extends { id: string }>(
  table: string,
  rows: T[],
): void {
  const cache = getTableCache(table);
  cache.clear();
  for (const row of rows) cache.set(row.id, rowSignature(row));
}

/** Returns only rows that differ from the last-seen state; updates the cache. */
function filterChanged<T extends { id: string }>(
  table: string,
  rows: T[],
): T[] {
  const cache = getTableCache(table);
  const changed: T[] = [];
  for (const row of rows) {
    const sig = rowSignature(row);
    if (cache.get(row.id) !== sig) {
      changed.push(row);
      cache.set(row.id, sig);
    }
  }
  return changed;
}

function evictCacheIds(table: string, ids: string[]): void {
  const cache = getTableCache(table);
  for (const id of ids) cache.delete(id);
}

function seedCacheFromPortfolioData(data: PortfolioData, userId: string): void {
  seedTableCache(
    TABLES.bankAccounts,
    data.bankAccounts.map((a) => mapBankAccountToRow(a, userId)),
  );
  seedTableCache(TABLES.transactions, mapTransactionToRows(data, userId));
  const { funds, lumpsums } = mapMutualFundRows(
    data.investments.mutualFunds,
    userId,
  );
  seedTableCache(TABLES.mutualFunds, funds);
  seedTableCache(TABLES.mfLumpsumEntries, lumpsums);
  const { portfolios, holdings } = mapStockPortfolioRows(
    data.investments.stockPortfolios,
    userId,
  );
  seedTableCache(TABLES.stockPortfolios, portfolios);
  seedTableCache(TABLES.stockHoldings, holdings);
  seedTableCache(
    TABLES.fixedDeposits,
    mapFixedDepositRows(data.investments.fd, userId),
  );
  seedTableCache(
    TABLES.recurringDeposits,
    mapRecurringDepositRows(data.investments.rd, userId),
  );
  seedTableCache(TABLES.loans, mapLoanRows(data.loans, userId));
  seedTableCache(
    TABLES.recurringRules,
    mapRecurringRuleRows(data.recurringRules, userId),
  );
}

function syncStockMappingsFromRemote(row?: SettingsRow | null) {
  if (!row?.stock_name_mappings) return;
  localStorage.setItem(
    "stock_name_mappings",
    JSON.stringify(row.stock_name_mappings),
  );
}

function getLocalStockMappings() {
  try {
    return JSON.parse(
      localStorage.getItem("stock_name_mappings") || "{}",
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function mapBankAccountToRow(
  account: BankAccount,
  userId: string,
): BankAccountRow {
  return {
    id: account.id,
    user_id: userId,
    bank_name: account.bankName,
    account_type: account.accountType,
    account_number: account.accountNumber || null,
    balance: account.balance,
    opening_balance: account.openingBalance ?? null,
    notes: account.notes || null,
    is_cash: account.isCash ?? false,
    updated_at: new Date().toISOString(),
  };
}

function importMeta(id: string): {
  import_source: string | null;
  external_id: string | null;
} {
  if (id.startsWith("mymoney_")) {
    return {
      import_source: "mymoney",
      external_id: id.slice("mymoney_".length),
    };
  }
  return { import_source: null, external_id: null };
}

function mapTransactionToRows(
  data: PortfolioData,
  userId: string,
): TransactionRow[] {
  const incomeRows: TransactionRow[] = data.income.map((entry) => ({
    id: entry.id,
    user_id: userId,
    type: "income",
    date: entry.date,
    amount: entry.amount,
    description: entry.description || null,
    category: null,
    source: entry.source,
    from_account_id: null,
    from_account_name: null,
    to_account_id: entry.toAccountId,
    to_account_name: entry.toAccountName,
    payment_method: null,
    fees: 0,
    is_auto_generated: false,
    auto_source_id: null,
    recurring_rule_id: null,
    ...importMeta(entry.id),
    updated_at: new Date().toISOString(),
  }));

  const expenseRows: TransactionRow[] = data.expenses.map((entry) => ({
    id: entry.id,
    user_id: userId,
    type: "expense",
    date: entry.date,
    amount: entry.amount,
    description: entry.description || null,
    category: entry.category,
    source: null,
    from_account_id: entry.fromAccountId,
    from_account_name: entry.fromAccountName,
    to_account_id: null,
    to_account_name: null,
    payment_method: entry.paymentMethod,
    fees: 0,
    is_auto_generated: entry.isAutoGenerated ?? false,
    recurring_rule_id: entry.recurringRuleId || null,
    auto_source_id: entry.autoSourceId || null,
    ...importMeta(entry.id),
    updated_at: new Date().toISOString(),
  }));

  const transferRows: TransactionRow[] = data.transfers.map((entry) => ({
    id: entry.id,
    user_id: userId,
    type: "transfer",
    date: entry.date,
    amount: entry.amount,
    description: entry.description || null,
    category: null,
    source: null,
    from_account_id: entry.fromAccountId,
    from_account_name: entry.fromAccountName,
    to_account_id: entry.toAccountId,
    to_account_name: entry.toAccountName,
    payment_method: null,
    fees: entry.fees || 0,
    is_auto_generated: false,
    auto_source_id: null,
    recurring_rule_id: null,
    ...importMeta(entry.id),
    updated_at: new Date().toISOString(),
  }));

  return [...incomeRows, ...expenseRows, ...transferRows];
}

function mapMutualFundRows(
  funds: MutualFund[],
  userId: string,
): {
  funds: MutualFundRow[];
  lumpsums: MFLumpsumRow[];
} {
  return {
    funds: funds.map((fund) => ({
      id: fund.id,
      user_id: userId,
      fund_name: fund.fundName,
      amc: fund.amc || null,
      category: fund.category || null,
      current_value: fund.currentValue,
      sip_monthly_amount: fund.sipDetails?.monthlyAmount ?? null,
      sip_start_date: fund.sipDetails?.startDate ?? null,
      sip_status: fund.sipDetails?.status ?? null,
      sip_from_account_id: fund.sipDetails?.fromAccountId ?? null,
      sip_from_account_name: fund.sipDetails?.fromAccountName ?? null,
      sip_payment_method: fund.sipDetails?.paymentMethod ?? null,
      sip_stopped_date: fund.sipDetails?.stoppedDate ?? null,
      created_at: fund.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    lumpsums: funds.flatMap((fund) =>
      fund.lumpsumEntries.map((entry) => ({
        id: entry.id,
        user_id: userId,
        fund_id: fund.id,
        date: entry.date,
        amount: entry.amount,
      })),
    ),
  };
}

function mapStockPortfolioRows(
  portfolios: StockPortfolio[],
  userId: string,
): {
  portfolios: StockPortfolioRow[];
  holdings: StockHoldingRow[];
} {
  return {
    portfolios: portfolios.map((portfolio) => ({
      id: portfolio.id,
      user_id: userId,
      name: portfolio.name,
      owner_name: portfolio.ownerName || null,
      broker: portfolio.broker || null,
      updated_at: new Date().toISOString(),
    })),
    holdings: portfolios.flatMap((portfolio) =>
      portfolio.holdings.map((holding) => ({
        id: holding.id,
        user_id: userId,
        portfolio_id: portfolio.id,
        company_name: holding.companyName,
        ticker: holding.ticker || null,
        quantity: holding.quantity,
        avg_buy_price: holding.avgBuyPrice,
        current_price: holding.currentPrice,
        updated_at: new Date().toISOString(),
      })),
    ),
  };
}

function mapFixedDepositRows(
  items: FixedDeposit[],
  userId: string,
): FixedDepositRow[] {
  return items.map((item) => ({
    id: item.id,
    user_id: userId,
    bank_name: item.bankName,
    principal: item.principal,
    interest_rate: item.interestRate,
    start_date: item.startDate,
    maturity_date: item.maturityDate,
    from_account_id: item.fromAccountId ?? null,
    from_account_name: item.fromAccountName ?? null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

function mapRecurringDepositRows(
  items: RecurringDeposit[],
  userId: string,
): RecurringDepositRow[] {
  return items.map((item) => ({
    id: item.id,
    user_id: userId,
    bank_name: item.bankName,
    monthly_deposit: item.monthlyDeposit,
    interest_rate: item.interestRate,
    start_date: item.startDate,
    maturity_date: item.maturityDate,
    from_account_id: item.fromAccountId ?? null,
    from_account_name: item.fromAccountName ?? null,
    payment_method: item.paymentMethod ?? null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

function mapLoanRows(items: Loan[], userId: string): LoanRow[] {
  return items.map((loan) => ({
    id: loan.id,
    user_id: userId,
    lender_name: loan.lenderName,
    loan_type: loan.loanType,
    principal_amount: loan.principalAmount,
    outstanding_balance: loan.outstandingBalance,
    emi_amount: loan.emiAmount,
    interest_rate: loan.interestRate,
    emi_day: loan.emiDate,
    start_date: loan.startDate,
    end_date: loan.endDate,
    updated_at: new Date().toISOString(),
  }));
}

function mapRecurringRuleRows(
  items: RecurringRule[],
  userId: string,
): RecurringRuleRow[] {
  return items.map((rule) => ({
    id: rule.id,
    user_id: userId,
    name: rule.name,
    amount: rule.amount,
    category: rule.category,
    payment_method: rule.paymentMethod,
    from_account_id: rule.fromAccountId,
    from_account_name: rule.fromAccountName,
    description: rule.description || null,
    frequency: rule.frequency,
    day_of_month: rule.dayOfMonth ?? null,
    day_of_week: rule.dayOfWeek ?? null,
    month_of_year: rule.monthOfYear ?? null,
    start_date: rule.startDate,
    end_date: rule.endDate,
    is_active: rule.isActive,
    last_processed_month: rule.lastProcessedMonth ?? null,
    updated_at: new Date().toISOString(),
  }));
}

function mapSettingsRow(data: PortfolioData, userId: string): SettingsRow {
  return {
    user_id: userId,
    monthly_budget: data.settings.monthlyBudget,
    financial_year_mode: data.settings.yearView === "financial",
    income_categories: data.settings.incomeCategories,
    expense_categories: data.settings.expenseCategories,
    stock_name_mappings: getLocalStockMappings(),
    updated_at: new Date().toISOString(),
  };
}

function rowToIncome(row: TransactionRow): IncomeEntry {
  return {
    id: row.id,
    date: row.date,
    source: row.source || "Other",
    amount: Number(row.amount || 0),
    description: row.description || undefined,
    toAccountId: row.to_account_id,
    toAccountName: row.to_account_name,
  };
}

function rowToExpense(row: TransactionRow): ExpenseEntry {
  return {
    id: row.id,
    date: row.date,
    category: row.category || "Other",
    amount: Number(row.amount || 0),
    fromAccountId: row.from_account_id,
    fromAccountName: row.from_account_name,
    paymentMethod: (row.payment_method ||
      "UPI") as ExpenseEntry["paymentMethod"],
    description: row.description || undefined,
    isAutoGenerated: row.is_auto_generated ?? false,
    recurringRuleId: row.recurring_rule_id || undefined,
    autoSourceId: row.auto_source_id || undefined,
  };
}

function rowToTransfer(row: TransactionRow): TransferEntry {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount || 0),
    fromAccountId: row.from_account_id || "",
    fromAccountName: row.from_account_name || "",
    toAccountId: row.to_account_id || "",
    toAccountName: row.to_account_name || "",
    description: row.description || undefined,
    fees: Number(row.fees || 0),
  };
}

function buildPortfolioDataFromRows(rows: {
  bankAccounts: BankAccountRow[];
  transactions: TransactionRow[];
  mutualFunds: MutualFundRow[];
  mfLumpsums: MFLumpsumRow[];
  stockPortfolios: StockPortfolioRow[];
  stockHoldings: StockHoldingRow[];
  fixedDeposits: FixedDepositRow[];
  recurringDeposits: RecurringDepositRow[];
  loans: LoanRow[];
  recurringRules: RecurringRuleRow[];
  settings: SettingsRow[];
}) {
  const lumpsumsByFund = rows.mfLumpsums.reduce<
    Record<string, MutualFund["lumpsumEntries"]>
  >((acc, row) => {
    acc[row.fund_id] = acc[row.fund_id] || [];
    acc[row.fund_id].push({
      id: row.id,
      date: row.date,
      amount: Number(row.amount || 0),
    });
    return acc;
  }, {});

  const holdingsByPortfolio = rows.stockHoldings.reduce<
    Record<string, Stock[]>
  >((acc, row) => {
    acc[row.portfolio_id] = acc[row.portfolio_id] || [];
    acc[row.portfolio_id].push({
      id: row.id,
      companyName: row.company_name,
      ticker: row.ticker || "",
      quantity: Number(row.quantity || 0),
      avgBuyPrice: Number(row.avg_buy_price || 0),
      currentPrice: Number(row.current_price || 0),
    });
    return acc;
  }, {});

  const settingsRow = rows.settings[0];
  syncStockMappingsFromRemote(settingsRow);

  return normalizePortfolioData({
    bankAccounts: rows.bankAccounts.map((row) => ({
      id: row.id,
      bankName: row.bank_name,
      accountType: row.account_type as BankAccount["accountType"],
      accountNumber: row.account_number || "",
      balance: Number(row.balance || 0),
      openingBalance:
        row.opening_balance != null ? Number(row.opening_balance) : undefined,
      notes: row.notes || undefined,
      isCash: row.is_cash ?? false,
    })),
    income: rows.transactions
      .filter((row) => row.type === "income")
      .map(rowToIncome),
    expenses: rows.transactions
      .filter((row) => row.type === "expense")
      .map(rowToExpense),
    transfers: rows.transactions
      .filter((row) => row.type === "transfer")
      .map(rowToTransfer),
    investments: {
      mutualFunds: rows.mutualFunds.map((row) => ({
        id: row.id,
        fundName: row.fund_name,
        amc: row.amc || "",
        category: (row.category || "Equity") as MutualFund["category"],
        currentValue: Number(row.current_value || 0),
        lumpsumEntries: lumpsumsByFund[row.id] || [],
        createdAt: row.created_at || undefined,
        sipDetails:
          row.sip_monthly_amount && row.sip_start_date
            ? {
                monthlyAmount: Number(row.sip_monthly_amount),
                startDate: row.sip_start_date,
                status: (row.sip_status ||
                  "Active") as MutualFund["sipDetails"]["status"],
                fromAccountId: row.sip_from_account_id || null,
                fromAccountName: row.sip_from_account_name || null,
                paymentMethod: (row.sip_payment_method ||
                  "Net Banking") as ExpenseEntry["paymentMethod"],
                stoppedDate: row.sip_stopped_date || undefined,
              }
            : undefined,
      })),
      stockPortfolios: rows.stockPortfolios.map((row) => ({
        id: row.id,
        name: row.name,
        ownerName: row.owner_name || "",
        broker: (row.broker || "Other") as StockPortfolio["broker"],
        holdings: holdingsByPortfolio[row.id] || [],
      })),
      fd: rows.fixedDeposits.map((row) => ({
        id: row.id,
        bankName: row.bank_name,
        principal: Number(row.principal || 0),
        interestRate: Number(row.interest_rate || 0),
        startDate: row.start_date,
        maturityDate: row.maturity_date,
        fromAccountId: row.from_account_id || null,
        fromAccountName: row.from_account_name || null,
        createdAt: row.created_at || undefined,
      })),
      rd: rows.recurringDeposits.map((row) => ({
        id: row.id,
        bankName: row.bank_name,
        monthlyDeposit: Number(row.monthly_deposit || 0),
        interestRate: Number(row.interest_rate || 0),
        startDate: row.start_date,
        maturityDate: row.maturity_date,
        fromAccountId: row.from_account_id || null,
        fromAccountName: row.from_account_name || null,
        paymentMethod: (row.payment_method ||
          "Net Banking") as ExpenseEntry["paymentMethod"],
        createdAt: row.created_at || undefined,
      })),
    },
    loans: rows.loans.map((row) => ({
      id: row.id,
      lenderName: row.lender_name,
      loanType: (row.loan_type || "Other") as Loan["loanType"],
      principalAmount: Number(row.principal_amount || 0),
      outstandingBalance: Number(row.outstanding_balance || 0),
      emiAmount: Number(row.emi_amount || 0),
      interestRate: Number(row.interest_rate || 0),
      emiDate: Number(row.emi_day || 1),
      startDate: row.start_date || "",
      endDate: row.end_date || "",
    })),
    recurringRules: rows.recurringRules.map((row) => ({
      id: row.id,
      name: row.name,
      amount: Number(row.amount || 0),
      category: row.category || "Other",
      paymentMethod: (row.payment_method ||
        "UPI") as RecurringRule["paymentMethod"],
      fromAccountId: row.from_account_id,
      fromAccountName: row.from_account_name,
      description: row.description || undefined,
      frequency: row.frequency as RecurringRule["frequency"],
      dayOfMonth: row.day_of_month ?? undefined,
      dayOfWeek: row.day_of_week ?? undefined,
      monthOfYear: row.month_of_year ?? undefined,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active ?? true,
      lastProcessedMonth: row.last_processed_month || undefined,
    })),
    settings: {
      monthlyBudget: Number(settingsRow?.monthly_budget ?? 50000),
      yearView: settingsRow?.financial_year_mode ? "financial" : "calendar",
      incomeCategories: settingsRow?.income_categories || undefined,
      expenseCategories: settingsRow?.expense_categories || undefined,
    },
  });
}

export async function fetchPortfolioData() {
  const userId = await getUserId();
  const [
    bankAccounts,
    transactions,
    mutualFunds,
    mfLumpsums,
    stockPortfolios,
    stockHoldings,
    fixedDeposits,
    recurringDeposits,
    loans,
    recurringRules,
    settings,
  ] = await Promise.all([
    fetchTable<BankAccountRow>(TABLES.bankAccounts),
    fetchTable<TransactionRow>(TABLES.transactions),
    fetchTable<MutualFundRow>(TABLES.mutualFunds),
    fetchTable<MFLumpsumRow>(TABLES.mfLumpsumEntries),
    fetchTable<StockPortfolioRow>(TABLES.stockPortfolios),
    fetchTable<StockHoldingRow>(TABLES.stockHoldings),
    fetchTable<FixedDepositRow>(TABLES.fixedDeposits),
    fetchTable<RecurringDepositRow>(TABLES.recurringDeposits),
    fetchTable<LoanRow>(TABLES.loans),
    fetchTable<RecurringRuleRow>(TABLES.recurringRules),
    fetchTable<SettingsRow>(TABLES.settings),
  ]);

  const data = buildPortfolioDataFromRows({
    bankAccounts,
    transactions,
    mutualFunds,
    mfLumpsums,
    stockPortfolios,
    stockHoldings,
    fixedDeposits,
    recurringDeposits,
    loans,
    recurringRules,
    settings,
  });

  seedCacheFromPortfolioData(data, userId);
  return data;
}

export function loadLegacyLocalData() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizePortfolioData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function persistPortfolioChanges(
  previous: PortfolioData,
  next: PortfolioData,
  keys: RootKey[],
) {
  const userId = await getUserId();
  const touched = new Set(keys);

  if (touched.has("bankAccounts")) {
    const nextRows = next.bankAccounts.map((item) =>
      mapBankAccountToRow(item, userId),
    );
    await safeUpsertRows(
      TABLES.bankAccounts,
      filterChanged(TABLES.bankAccounts, nextRows),
    );
    const deletedIds = diffIds(previous.bankAccounts, next.bankAccounts);
    await safeDeleteRows(TABLES.bankAccounts, deletedIds);
    evictCacheIds(TABLES.bankAccounts, deletedIds);
  }

  if (
    touched.has("income") ||
    touched.has("expenses") ||
    touched.has("transfers")
  ) {
    const nextTransactions = mapTransactionToRows(next, userId);
    await safeUpsertRows(
      TABLES.transactions,
      filterChanged(TABLES.transactions, nextTransactions),
    );
    const deletedTxIds = [
      ...diffIds(previous.income, next.income),
      ...diffIds(previous.expenses, next.expenses),
      ...diffIds(previous.transfers, next.transfers),
    ];
    await safeDeleteRows(TABLES.transactions, deletedTxIds);
    evictCacheIds(TABLES.transactions, deletedTxIds);
  }

  if (touched.has("investments")) {
    const prevFundRows = mapMutualFundRows(
      previous.investments.mutualFunds,
      userId,
    );
    const nextFundRows = mapMutualFundRows(
      next.investments.mutualFunds,
      userId,
    );
    await safeUpsertRows(
      TABLES.mutualFunds,
      filterChanged(TABLES.mutualFunds, nextFundRows.funds),
    );
    const deletedFunds = diffIds(
      previous.investments.mutualFunds,
      next.investments.mutualFunds,
    );
    await safeDeleteRows(TABLES.mutualFunds, deletedFunds);
    evictCacheIds(TABLES.mutualFunds, deletedFunds);

    await safeUpsertRows(
      TABLES.mfLumpsumEntries,
      filterChanged(TABLES.mfLumpsumEntries, nextFundRows.lumpsums),
    );
    const deletedLumpsums = diffIds(
      prevFundRows.lumpsums,
      nextFundRows.lumpsums,
    );
    await safeDeleteRows(TABLES.mfLumpsumEntries, deletedLumpsums);
    evictCacheIds(TABLES.mfLumpsumEntries, deletedLumpsums);

    const prevStockRows = mapStockPortfolioRows(
      previous.investments.stockPortfolios,
      userId,
    );
    const nextStockRows = mapStockPortfolioRows(
      next.investments.stockPortfolios,
      userId,
    );
    await safeUpsertRows(
      TABLES.stockPortfolios,
      filterChanged(TABLES.stockPortfolios, nextStockRows.portfolios),
    );
    const deletedPortfolios = diffIds(
      previous.investments.stockPortfolios,
      next.investments.stockPortfolios,
    );
    await safeDeleteRows(TABLES.stockPortfolios, deletedPortfolios);
    evictCacheIds(TABLES.stockPortfolios, deletedPortfolios);

    await safeUpsertRows(
      TABLES.stockHoldings,
      filterChanged(TABLES.stockHoldings, nextStockRows.holdings),
    );
    const deletedHoldings = diffIds(
      prevStockRows.holdings,
      nextStockRows.holdings,
    );
    await safeDeleteRows(TABLES.stockHoldings, deletedHoldings);
    evictCacheIds(TABLES.stockHoldings, deletedHoldings);

    const nextFDs = mapFixedDepositRows(next.investments.fd, userId);
    await safeUpsertRows(
      TABLES.fixedDeposits,
      filterChanged(TABLES.fixedDeposits, nextFDs),
    );
    const deletedFDs = diffIds(previous.investments.fd, next.investments.fd);
    await safeDeleteRows(TABLES.fixedDeposits, deletedFDs);
    evictCacheIds(TABLES.fixedDeposits, deletedFDs);

    const nextRDs = mapRecurringDepositRows(next.investments.rd, userId);
    await safeUpsertRows(
      TABLES.recurringDeposits,
      filterChanged(TABLES.recurringDeposits, nextRDs),
    );
    const deletedRDs = diffIds(previous.investments.rd, next.investments.rd);
    await safeDeleteRows(TABLES.recurringDeposits, deletedRDs);
    evictCacheIds(TABLES.recurringDeposits, deletedRDs);
  }

  if (touched.has("loans")) {
    const nextRows = mapLoanRows(next.loans, userId);
    await safeUpsertRows(TABLES.loans, filterChanged(TABLES.loans, nextRows));
    const deletedIds = diffIds(previous.loans, next.loans);
    await safeDeleteRows(TABLES.loans, deletedIds);
    evictCacheIds(TABLES.loans, deletedIds);
  }

  if (touched.has("recurringRules")) {
    const nextRows = mapRecurringRuleRows(next.recurringRules, userId);
    await safeUpsertRows(
      TABLES.recurringRules,
      filterChanged(TABLES.recurringRules, nextRows),
    );
    const deletedIds = diffIds(previous.recurringRules, next.recurringRules);
    await safeDeleteRows(TABLES.recurringRules, deletedIds);
    evictCacheIds(TABLES.recurringRules, deletedIds);
  }

  if (touched.has("settings")) {
    await safeUpsertRows(TABLES.settings, [mapSettingsRow(next, userId)]);
  }
}

export async function clearRemotePortfolioData() {
  // Deletes must be sequential and ordered to respect FK constraints.
  // Full FK reference graph (→ = "column references table"):
  //
  //   mf_lumpsum_entries.fund_id          → mutual_funds        ON DELETE CASCADE
  //   stock_holdings.portfolio_id          → stock_portfolios    ON DELETE CASCADE
  //   transactions.from_account_id         → bank_accounts       ON DELETE SET NULL  ← schema.sql migration
  //   transactions.to_account_id           → bank_accounts       ON DELETE SET NULL  ← schema.sql migration
  //   mutual_funds.sip_from_account_id     → bank_accounts       NO ACTION
  //   fixed_deposits.from_account_id       → bank_accounts       NO ACTION
  //   recurring_deposits.from_account_id   → bank_accounts       NO ACTION
  //
  // Safe delete order:
  //   Step 1 — leaf/child rows (clear before their parents):
  //            mf_lumpsum_entries, stock_holdings, transactions
  //   Step 2 — tables that hold FK references into bank_accounts (must precede it):
  //            mutual_funds, fixed_deposits, recurring_deposits
  //   Step 3 — independent tables (no remaining FK dependencies):
  //            stock_portfolios, loans, recurring_rules
  //   Step 4 — bank_accounts (safe now: transactions rows gone, sip/fd/rd rows gone)
  //   Step 5 — settings (singleton row, no FK dependencies)

  const del = async (table: string) => {
    const { error } = await supabase.from(table).delete().neq("id", "");
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  };

  try {
    // Step 1 — leaf / child rows
    await del(TABLES.mfLumpsumEntries);
    await del(TABLES.stockHoldings);
    await del(TABLES.transactions);

    // Step 2 — tables referencing bank_accounts (NO ACTION FKs)
    await del(TABLES.mutualFunds);
    await del(TABLES.fixedDeposits);
    await del(TABLES.recurringDeposits);

    // Step 3 — independent tables
    await del(TABLES.stockPortfolios);
    await del(TABLES.loans);
    await del(TABLES.recurringRules);

    // Step 4 — bank_accounts
    await del(TABLES.bankAccounts);

    // Step 5 — settings (keyed on user_id after migration)
    const { error } = await supabase
      .from(TABLES.settings)
      .delete()
      .not("user_id", "is", null);
    if (error) throw new Error(`clear settings: ${error.message}`);
  } catch (error) {
    throw new Error(
      `clearRemotePortfolioData failed (database may be partially wiped): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function clearLocalAppCaches() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(MIGRATION_FLAG_KEY);
  localStorage.removeItem(OFFLINE_BUFFER_KEY);
}

export function getLocalStorageUsage() {
  const relevantKeys = [
    OFFLINE_BUFFER_KEY,
    MIGRATION_FLAG_KEY,
    "stock_name_mappings",
    LEGACY_STORAGE_KEY,
  ];
  const totalBytes = relevantKeys.reduce(
    (sum, key) => sum + new Blob([localStorage.getItem(key) || ""]).size,
    0,
  );
  return `${(totalBytes / 1024).toFixed(2)} KB`;
}
