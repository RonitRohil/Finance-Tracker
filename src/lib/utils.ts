import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  BankAccount,
  CategoryDefinition,
  ExpenseCategory,
  ExpenseEntry,
  IncomeEntry,
  MutualFund,
  PaymentMethod,
  PortfolioData,
  RecurringDeposit,
  RecurringRule,
  SIPDetails,
  TransferEntry,
  YearViewMode,
} from "../types";
import { CASH_ACCOUNT } from "./storage";
import { normalizeStockName } from "../utils/stockNormalizer";

// ── Auto-generated entry identity ────────────────────────────────────────────
// Single source of truth for the id/autoSourceId prefixes written by the three
// auto-generation paths (SIP, RD, recurring rules).  Import these constants
// instead of using inline string literals so a rename stays in one place.
export const SIP_AUTO_ID_PREFIX = "sip_auto_";
export const RD_AUTO_ID_PREFIX = "rd_auto_";
export const RECURRING_AUTO_ID_PREFIX = "rec_";
export const SIP_SOURCE_PREFIX = "sip:";
export const RD_SOURCE_PREFIX = "rd:";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);

export const formatDate = (date: string | Date) => {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return d.toLocaleDateString("en-GB");
};

export const toISODate = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10);
};

export const getTodayISO = () => toISODate(new Date());

export const monthKey = (date: string | Date) => {
  const value = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
};

export const filterByMonth = <T extends { date: string }>(
  items: T[],
  year: number,
  month: number,
) =>
  items.filter((item) => {
    const d = new Date(`${item.date}T00:00:00`);
    return d.getFullYear() === year && d.getMonth() === month;
  });

export const startOfMonthISO = (date: string | Date) => `${monthKey(date)}-01`;

export const createSafeDate = (
  year: number,
  monthIndex: number,
  dayOfMonth: number,
) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(dayOfMonth, lastDay));
};

export const addMonthsSafe = (date: Date, months: number) => {
  const base = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return createSafeDate(base.getFullYear(), base.getMonth(), date.getDate());
};

export const diffMonthsInclusive = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (end.getDate() >= start.getDate()) months += 1;
  return Math.max(0, months);
};

export const calculateMonthsElapsed = (startDate: string, endDate?: string) =>
  diffMonthsInclusive(startDate, endDate || getTodayISO());

export const calculateSIPInvested = (
  monthlyAmount: number,
  startDate: string,
  status: SIPDetails["status"] = "Active",
  stoppedDate?: string,
) =>
  calculateMonthsElapsed(
    startDate,
    status === "Stopped" && stoppedDate ? stoppedDate : getTodayISO(),
  ) * monthlyAmount;

export const getComputedSipInvested = (sipDetails?: SIPDetails) =>
  sipDetails
    ? calculateSIPInvested(
        sipDetails.monthlyAmount,
        sipDetails.startDate,
        sipDetails.status,
        sipDetails.stoppedDate,
      )
    : 0;

export const calculateMaturityAmount = (
  principal: number,
  rate: number,
  years: number,
  compoundingFrequency = 4,
) => {
  const r = rate / 100;
  return (
    principal *
    Math.pow(1 + r / compoundingFrequency, compoundingFrequency * years)
  );
};

export const calculateRDInvested = (
  monthlyDeposit: number,
  startDate: string,
  maturityDate: string,
) => {
  const effectiveEnd =
    new Date(getTodayISO()) > new Date(`${maturityDate}T00:00:00`)
      ? maturityDate
      : getTodayISO();
  return (
    Math.min(
      calculateMonthsElapsed(startDate, effectiveEnd),
      calculateMonthsElapsed(startDate, maturityDate),
    ) * monthlyDeposit
  );
};

export const calculateRDMaturityAmount = (
  monthlyDeposit: number,
  rate: number,
  months: number,
) => {
  const i = rate / 400;
  const n = months / 3;
  return (
    (monthlyDeposit * (Math.pow(1 + i, n) - 1)) / (1 - Math.pow(1 + i, -1 / 3))
  );
};

export const calculateRDValue = (
  monthlyDeposit: number,
  rate: number,
  startDate: string,
  maturityDate: string,
) => {
  const start = new Date(`${startDate}T00:00:00`);
  const maturity = new Date(`${maturityDate}T00:00:00`);
  const now = new Date();
  if (now <= start) return monthlyDeposit;
  return calculateRDMaturityAmount(
    monthlyDeposit,
    rate,
    calculateMonthsElapsed(
      startDate,
      now > maturity ? maturityDate : getTodayISO(),
    ),
  );
};

export const calculateFDValue = (
  principal: number,
  rate: number,
  startDate: string,
  maturityDate: string,
) => {
  const start = new Date(`${startDate}T00:00:00`);
  const maturity = new Date(`${maturityDate}T00:00:00`);
  const now = new Date();
  if (now <= start) return principal;
  const effectiveEnd = now > maturity ? maturity : now;
  return calculateMaturityAmount(
    principal,
    rate,
    (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365),
    4,
  );
};

export const calculateWeightedAverage = (
  existingQty: number,
  existingAvg: number,
  newQty: number,
  newPrice: number,
) =>
  existingQty + newQty === 0
    ? 0
    : (existingQty * existingAvg + newQty * newPrice) / (existingQty + newQty);

export const parseCSV = (csv: string) => {
  const cleanCsv = csv.replace(/^\uFEFF/, "");
  const lines = cleanCsv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const delimiter =
    (lines[0].match(/,/g) || []).length >= (lines[0].match(/;/g) || []).length
      ? ","
      : ";";
  const splitLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else current += char;
    }
    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) =>
    splitLine(line).reduce<Record<string, string>>((acc, value, index) => {
      if (headers[index]) acc[headers[index]] = value;
      return acc;
    }, {}),
  );
};

export const getAllAccounts = (data: PortfolioData) => {
  const storedCashAccount = data.bankAccounts.find(
    (account) => account.id === CASH_ACCOUNT.id,
  );
  return [
    { ...CASH_ACCOUNT, ...(storedCashAccount || {}) },
    ...data.bankAccounts.filter((account) => account.id !== CASH_ACCOUNT.id),
  ];
};

export const getAccountNameById = (
  data: PortfolioData,
  accountId: string | null,
) =>
  getAllAccounts(data).find((account) => account.id === accountId)?.bankName ||
  null;

export const isCashAccount = (accountId: string | null) =>
  accountId === CASH_ACCOUNT.id;

export const getExpenseMethods = (): PaymentMethod[] => [
  "Cash",
  "UPI",
  "Card",
  "Net Banking",
  "NEFT/IMPS",
  "Cheque",
];

export const getCategoryDisplayPath = (
  category: CategoryDefinition,
  allCategories: CategoryDefinition[],
) => {
  if (!category.parentId) return category.name;
  const parent = allCategories.find((item) => item.id === category.parentId);
  return parent ? `${parent.name} / ${category.name}` : category.name;
};

export const getExpenseCategories = (data?: PortfolioData): ExpenseCategory[] =>
  data?.settings?.expenseCategories?.map((category) =>
    getCategoryDisplayPath(category, data.settings.expenseCategories),
  ) || [
    "Food",
    "Rent",
    "EMI",
    "Utilities",
    "Entertainment",
    "Medical",
    "Travel",
    "Investment",
    "Beauty",
    "Social Life",
    "Transport",
    "Other",
  ];

export const getIncomeSources = (data?: PortfolioData): string[] =>
  data?.settings?.incomeCategories?.map((category) =>
    getCategoryDisplayPath(category, data.settings.incomeCategories),
  ) || ["Salary", "Freelance", "Dividends", "Interest", "Rental", "Other"];

/**
 * Computes the "true" balance from the opening balance anchor plus all
 * recorded transactions.  Returns undefined when openingBalance is not set
 * (no anchor → drift detection unavailable for that account).
 */
export const computeAccountBalance = (
  data: PortfolioData,
  accountId: string,
): number | undefined => {
  const account = getAllAccounts(data).find((a) => a.id === accountId);
  if (!account || account.openingBalance === undefined) return undefined;

  const inflow = data.income
    .filter((e) => e.toAccountId === accountId)
    .reduce((s, e) => s + e.amount, 0);

  const outflow = data.expenses
    .filter((e) => e.fromAccountId === accountId)
    .reduce((s, e) => s + e.amount, 0);

  const transferIn = data.transfers
    .filter((t) => t.toAccountId === accountId)
    .reduce((s, t) => s + t.amount, 0);

  const transferOut = data.transfers
    .filter((t) => t.fromAccountId === accountId)
    .reduce((s, t) => s + t.amount + (t.fees || 0), 0);

  return account.openingBalance + inflow - outflow + transferIn - transferOut;
};

export const updateAccountBalance = (
  data: PortfolioData,
  accountId: string,
  nextBalance: number,
) =>
  recalculateAccountNames({
    ...data,
    bankAccounts: getAllAccounts(data).map((account) =>
      account.id === accountId ? { ...account, balance: nextBalance } : account,
    ),
  });

export const getCategoryBreakdown = (
  items: Array<{ amount: number; category?: string; source?: string }>,
  key: "category" | "source",
) =>
  Array.from(
    items.reduce((map, item) => {
      const label = String(item[key] || "Other");
      map.set(label, (map.get(label) || 0) + item.amount);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

export const mergeImportedCategories = (
  existing: CategoryDefinition[],
  imported: CategoryDefinition[],
) => {
  const merged = [...existing];
  imported.forEach((category) => {
    const exists = merged.some(
      (item) =>
        item.type === category.type &&
        item.name.toLowerCase() === category.name.toLowerCase() &&
        (item.parentName || "").toLowerCase() ===
          (category.parentName || "").toLowerCase(),
    );
    if (!exists) merged.push(category);
  });
  return merged;
};

export const getMutualFundInvestedAmount = (fund: MutualFund) =>
  getComputedSipInvested(fund.sipDetails) +
  fund.lumpsumEntries.reduce((sum, entry) => sum + entry.amount, 0);

export const getCombinedStockHoldings = (data: PortfolioData) => {
  const grouped = new Map<
    string,
    {
      name: string;
      totalQty: number;
      weightedAvgPrice: number;
      currentPrice: number;
      totalInvested: number;
      totalCurrentValue: number;
      portfolios: string[];
      tickers: string[];
    }
  >();
  data.investments.stockPortfolios.forEach((portfolio) => {
    portfolio.holdings.forEach((holding) => {
      const normalizedName = normalizeStockName(holding.companyName);
      const existing = grouped.get(normalizedName);
      const invested = holding.quantity * holding.avgBuyPrice;
      const currentValue = holding.quantity * holding.currentPrice;
      const portfolioLabel = `${portfolio.ownerName}/${portfolio.broker}`;
      if (existing) {
        grouped.set(normalizedName, {
          ...existing,
          totalQty: existing.totalQty + holding.quantity,
          weightedAvgPrice:
            (existing.totalInvested + invested) /
            (existing.totalQty + holding.quantity),
          currentPrice: holding.currentPrice || existing.currentPrice,
          totalInvested: existing.totalInvested + invested,
          totalCurrentValue: existing.totalCurrentValue + currentValue,
          portfolios: Array.from(
            new Set([...existing.portfolios, portfolioLabel]),
          ),
          tickers: Array.from(new Set([...existing.tickers, holding.ticker])),
        });
      } else {
        grouped.set(normalizedName, {
          name: normalizedName,
          totalQty: holding.quantity,
          weightedAvgPrice: holding.avgBuyPrice,
          currentPrice: holding.currentPrice,
          totalInvested: invested,
          totalCurrentValue: currentValue,
          portfolios: [portfolioLabel],
          tickers: [holding.ticker],
        });
      }
    });
  });
  return Array.from(grouped.values()).sort(
    (a, b) => b.totalCurrentValue - a.totalCurrentValue,
  );
};

export const getMonthlyCashflowSeries = (
  data: PortfolioData,
  count = 6,
  yearView: YearViewMode = "calendar",
) => {
  const today = new Date();
  const yearStart =
    yearView === "financial"
      ? new Date(
          today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
          3,
          1,
        )
      : new Date(today.getFullYear(), 0, 1);
  return Array.from({ length: count }, (_, index) =>
    addMonthsSafe(today, -(count - 1 - index)),
  )
    .filter((date) => date >= yearStart || count <= 6)
    .map((date) => {
      const key = monthKey(date);
      return {
        key,
        month: date.toLocaleDateString("en-IN", { month: "short" }),
        income: data.income
          .filter((entry) => entry.date.startsWith(key))
          .reduce((sum, entry) => sum + entry.amount, 0),
        expense: data.expenses
          .filter((entry) => entry.date.startsWith(key))
          .reduce((sum, entry) => sum + entry.amount, 0),
        transfers: data.transfers
          .filter((entry) => entry.date.startsWith(key))
          .reduce((sum, entry) => sum + entry.amount, 0),
      };
    });
};

export const getNetWorthTrend = (data: PortfolioData, months = 12) => {
  const currentInvestmentValue =
    data.investments.mutualFunds.reduce((sum, mf) => sum + mf.currentValue, 0) +
    data.investments.stockPortfolios.reduce(
      (sum, portfolio) =>
        sum +
        portfolio.holdings.reduce(
          (holdingSum, holding) =>
            holdingSum + holding.quantity * holding.currentPrice,
          0,
        ),
      0,
    ) +
    data.investments.fd.reduce(
      (sum, fd) =>
        sum +
        calculateFDValue(
          fd.principal,
          fd.interestRate,
          fd.startDate,
          fd.maturityDate,
        ),
      0,
    ) +
    data.investments.rd.reduce(
      (sum, rd) =>
        sum +
        calculateRDValue(
          rd.monthlyDeposit,
          rd.interestRate,
          rd.startDate,
          rd.maturityDate,
        ),
      0,
    );
  return Array.from({ length: months }, (_, index) => {
    const pointDate = addMonthsSafe(new Date(), -(months - 1 - index));
    const pointKey = monthKey(pointDate);
    return {
      month: pointDate.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      }),
      netWorth:
        data.income
          .filter((entry) => entry.date <= `${pointKey}-31`)
          .reduce((sum, entry) => sum + entry.amount, 0) -
        data.expenses
          .filter((entry) => entry.date <= `${pointKey}-31`)
          .reduce((sum, entry) => sum + entry.amount, 0) +
        currentInvestmentValue -
        data.loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0),
    };
  });
};

export const getYearLabel = (mode: YearViewMode, referenceDate = new Date()) =>
  mode === "calendar"
    ? String(referenceDate.getFullYear())
    : `FY ${referenceDate.getMonth() >= 3 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1}-${String(((referenceDate.getMonth() >= 3 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1) + 1) % 100).padStart(2, "0")}`;

export const getNeedsAttention = (data: PortfolioData) => {
  const now = new Date(`${getTodayISO()}T00:00:00`);
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  const monthExpenses = data.expenses
    .filter((entry) => entry.date.startsWith(monthKey(now)))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const warnings: {
    id: string;
    message: string;
    severity: "warning" | "danger" | "info";
  }[] = [];
  data.investments.fd.forEach((fd) => {
    const maturity = new Date(`${fd.maturityDate}T00:00:00`);
    if (maturity >= now && maturity <= inThirtyDays)
      warnings.push({
        id: `fd-${fd.id}`,
        message: `${fd.bankName} FD matures on ${formatDate(fd.maturityDate)}.`,
        severity: "warning",
      });
  });
  data.investments.rd.forEach((rd) => {
    const maturity = new Date(`${rd.maturityDate}T00:00:00`);
    if (maturity >= now && maturity <= inThirtyDays)
      warnings.push({
        id: `rd-${rd.id}`,
        message: `${rd.bankName} RD completes on ${formatDate(rd.maturityDate)}.`,
        severity: "warning",
      });
  });
  if (
    data.settings.monthlyBudget > 0 &&
    monthExpenses > data.settings.monthlyBudget * 0.9
  )
    warnings.push({
      id: "budget",
      message: `This month's expenses are at ${Math.round((monthExpenses / data.settings.monthlyBudget) * 100)}% of budget.`,
      severity:
        monthExpenses > data.settings.monthlyBudget ? "danger" : "warning",
    });
  data.investments.mutualFunds
    .filter((mf) => mf.sipDetails?.status === "Paused")
    .forEach((mf) =>
      warnings.push({
        id: `sip-${mf.id}`,
        message: `SIP paused for ${mf.fundName}.`,
        severity: "info",
      }),
    );
  data.investments.stockPortfolios.forEach((portfolio) =>
    portfolio.holdings
      .filter((holding) => holding.currentPrice === 0)
      .forEach((holding) =>
        warnings.push({
          id: `stock-${holding.id}`,
          message: `${normalizeStockName(holding.companyName)} has current price 0. Update it to keep portfolio values accurate.`,
          severity: "danger",
        }),
      ),
  );
  return warnings;
};

const sortByDate = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

export type TransactionLike = IncomeEntry | ExpenseEntry | TransferEntry;

export const buildAccountMap = (accounts: BankAccount[]) =>
  new Map(accounts.map((account) => [account.id, account]));

export const recalculateAccountNames = (data: PortfolioData): PortfolioData => {
  const accountMap = buildAccountMap(getAllAccounts(data));
  return {
    ...data,
    income: data.income.map((entry) => ({
      ...entry,
      toAccountName: entry.toAccountId
        ? accountMap.get(entry.toAccountId)?.bankName || entry.toAccountName
        : null,
    })),
    expenses: data.expenses.map((entry) => ({
      ...entry,
      fromAccountName: entry.fromAccountId
        ? accountMap.get(entry.fromAccountId)?.bankName || entry.fromAccountName
        : null,
    })),
    transfers: data.transfers.map((entry) => ({
      ...entry,
      fromAccountName:
        accountMap.get(entry.fromAccountId)?.bankName || entry.fromAccountName,
      toAccountName:
        accountMap.get(entry.toAccountId)?.bankName || entry.toAccountName,
    })),
    recurringRules: data.recurringRules.map((rule) => ({
      ...rule,
      fromAccountName: rule.fromAccountId
        ? accountMap.get(rule.fromAccountId)?.bankName || rule.fromAccountName
        : null,
    })),
  };
};

export const withUpdatedAccountBalances = (
  accounts: BankAccount[],
  deltas: Record<string, number>,
) =>
  accounts.map((account) => ({
    ...account,
    balance: account.balance + (deltas[account.id] || 0),
  }));

export const getIncomeBalanceDelta = (entry: IncomeEntry) =>
  entry.toAccountId ? { [entry.toAccountId]: entry.amount } : {};
export const getExpenseBalanceDelta = (entry: ExpenseEntry) =>
  entry.fromAccountId ? { [entry.fromAccountId]: -entry.amount } : {};
export const getTransferBalanceDelta = (entry: TransferEntry) => ({
  [entry.fromAccountId]: -(entry.amount + (entry.fees || 0)),
  [entry.toAccountId]: entry.amount,
});

export const combineBalanceDeltas = (...deltas: Record<string, number>[]) =>
  deltas.reduce<Record<string, number>>((acc, item) => {
    Object.entries(item).forEach(([accountId, delta]) => {
      acc[accountId] = (acc[accountId] || 0) + delta;
    });
    return acc;
  }, {});

export const saveIncomeEntry = (
  data: PortfolioData,
  entry: IncomeEntry,
  previous?: IncomeEntry | null,
) => {
  const income = previous
    ? data.income.map((item) => (item.id === previous.id ? entry : item))
    : [...data.income, entry];
  const deltas = combineBalanceDeltas(
    previous ? invertDeltas(getIncomeBalanceDelta(previous)) : {},
    getIncomeBalanceDelta(entry),
  );
  return recalculateAccountNames({
    ...data,
    income,
    bankAccounts: withUpdatedAccountBalances(getAllAccounts(data), deltas),
  });
};

export const saveExpenseEntry = (
  data: PortfolioData,
  entry: ExpenseEntry,
  previous?: ExpenseEntry | null,
) => {
  const expenses = previous
    ? data.expenses.map((item) => (item.id === previous.id ? entry : item))
    : [...data.expenses, entry];
  const deltas = combineBalanceDeltas(
    previous ? invertDeltas(getExpenseBalanceDelta(previous)) : {},
    getExpenseBalanceDelta(entry),
  );
  return recalculateAccountNames({
    ...data,
    expenses,
    bankAccounts: withUpdatedAccountBalances(getAllAccounts(data), deltas),
  });
};

export const saveTransferEntry = (
  data: PortfolioData,
  entry: TransferEntry,
  previous?: TransferEntry | null,
) => {
  const transfers = previous
    ? data.transfers.map((item) => (item.id === previous.id ? entry : item))
    : [...data.transfers, entry];
  const deltas = combineBalanceDeltas(
    previous ? invertDeltas(getTransferBalanceDelta(previous)) : {},
    getTransferBalanceDelta(entry),
  );
  return recalculateAccountNames({
    ...data,
    transfers,
    bankAccounts: withUpdatedAccountBalances(getAllAccounts(data), deltas),
  });
};

export const deleteIncomeEntry = (data: PortfolioData, entry: IncomeEntry) =>
  recalculateAccountNames({
    ...data,
    income: data.income.filter((item) => item.id !== entry.id),
    bankAccounts: withUpdatedAccountBalances(
      getAllAccounts(data),
      invertDeltas(getIncomeBalanceDelta(entry)),
    ),
  });

export const deleteExpenseEntry = (data: PortfolioData, entry: ExpenseEntry) =>
  recalculateAccountNames({
    ...data,
    expenses: data.expenses.filter((item) => item.id !== entry.id),
    bankAccounts: withUpdatedAccountBalances(
      getAllAccounts(data),
      invertDeltas(getExpenseBalanceDelta(entry)),
    ),
  });

export const deleteTransferEntry = (
  data: PortfolioData,
  entry: TransferEntry,
) =>
  recalculateAccountNames({
    ...data,
    transfers: data.transfers.filter((item) => item.id !== entry.id),
    bankAccounts: withUpdatedAccountBalances(
      getAllAccounts(data),
      invertDeltas(getTransferBalanceDelta(entry)),
    ),
  });

export const invertDeltas = (deltas: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(deltas).map(([accountId, delta]) => [accountId, -delta]),
  );

export const getProjectedAccountBalance = (
  accounts: BankAccount[],
  accountId: string | null,
  delta: number,
) =>
  accountId
    ? (accounts.find((account) => account.id === accountId)?.balance || 0) +
      delta
    : 0;

function isSipGeneratedExpense(entry: ExpenseEntry) {
  return (
    entry.autoSourceId?.startsWith(SIP_SOURCE_PREFIX) === true ||
    entry.id.startsWith(SIP_AUTO_ID_PREFIX)
  );
}

function isRDGeneratedExpense(entry: ExpenseEntry) {
  return (
    entry.autoSourceId?.startsWith(RD_SOURCE_PREFIX) === true ||
    entry.id.startsWith(RD_AUTO_ID_PREFIX)
  );
}

function isInvestmentScheduleExpense(entry: ExpenseEntry) {
  return isSipGeneratedExpense(entry) || isRDGeneratedExpense(entry);
}

export const countUnlinkedTransactions = (data: PortfolioData) =>
  data.income.filter((entry) => !entry.toAccountId).length +
  data.expenses.filter(
    (entry) => !entry.fromAccountId && !isInvestmentScheduleExpense(entry),
  ).length +
  data.recurringRules.filter((rule) => !rule.fromAccountId).length;

export const getUnlinkedEntries = (data: PortfolioData) => ({
  income: data.income.filter((entry) => !entry.toAccountId),
  expenses: data.expenses.filter(
    (entry) => !entry.fromAccountId && !isInvestmentScheduleExpense(entry),
  ),
  recurringRules: data.recurringRules.filter((rule) => !rule.fromAccountId),
});

export const getAccountMonthlyStats = (
  data: PortfolioData,
  accountId: string,
  year: number,
  month: number,
) => {
  const income = filterByMonth(
    data.income.filter((entry) => entry.toAccountId === accountId),
    year,
    month,
  );
  const expenses = filterByMonth(
    data.expenses.filter((entry) => entry.fromAccountId === accountId),
    year,
    month,
  );
  const transfers = filterByMonth(
    data.transfers.filter(
      (entry) =>
        entry.fromAccountId === accountId || entry.toAccountId === accountId,
    ),
    year,
    month,
  );
  return {
    incomeTotal: income.reduce((sum, entry) => sum + entry.amount, 0),
    expenseTotal: expenses.reduce((sum, entry) => sum + entry.amount, 0),
    transfersTotal: transfers.reduce((sum, entry) => sum + entry.amount, 0),
  };
};

export const getRecentAccountTransactions = (
  data: PortfolioData,
  accountId: string,
) =>
  [
    ...data.income
      .filter((entry) => entry.toAccountId === accountId)
      .map((entry) => ({ ...entry, kind: "income" as const })),
    ...data.expenses
      .filter((entry) => entry.fromAccountId === accountId)
      .map((entry) => ({ ...entry, kind: "expense" as const })),
    ...data.transfers
      .filter(
        (entry) =>
          entry.fromAccountId === accountId || entry.toAccountId === accountId,
      )
      .map((entry) => ({ ...entry, kind: "transfer" as const })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

function getLaterDate(firstDate: string, secondDate?: string) {
  if (!secondDate) return firstDate;
  return new Date(`${firstDate}T00:00:00`) >= new Date(`${secondDate}T00:00:00`)
    ? firstDate
    : secondDate;
}

function buildGeneratedInvestmentExpense(
  existingEntry: ExpenseEntry | undefined,
  nextEntry: ExpenseEntry,
) {
  if (!existingEntry) return nextEntry;

  return {
    ...existingEntry,
    amount: nextEntry.amount,
    date: nextEntry.date,
    category: nextEntry.category,
    fromAccountId: nextEntry.fromAccountId,
    fromAccountName: nextEntry.fromAccountName,
    paymentMethod: nextEntry.paymentMethod,
    description: existingEntry.description || nextEntry.description,
    isAutoGenerated: true,
    autoSourceId: nextEntry.autoSourceId,
  };
}

function applyGeneratedExpenseDiff(
  previousData: PortfolioData,
  nextExpenses: ExpenseEntry[],
) {
  const previousAuto = new Map(
    previousData.expenses
      .filter((entry) => entry.isAutoGenerated)
      .map((entry) => [entry.id, entry]),
  );
  const nextAuto = new Map(
    nextExpenses
      .filter((entry) => entry.isAutoGenerated)
      .map((entry) => [entry.id, entry]),
  );

  const deltas: Record<string, number> = {};

  previousAuto.forEach((entry, id) => {
    if (!nextAuto.has(id)) {
      Object.entries(invertDeltas(getExpenseBalanceDelta(entry))).forEach(
        ([accountId, delta]) => {
          deltas[accountId] = (deltas[accountId] || 0) + delta;
        },
      );
    }
  });

  nextAuto.forEach((entry, id) => {
    const previousEntry = previousAuto.get(id);
    const previousDelta = previousEntry
      ? invertDeltas(getExpenseBalanceDelta(previousEntry))
      : {};
    const nextDelta = getExpenseBalanceDelta(entry);
    Object.entries(combineBalanceDeltas(previousDelta, nextDelta)).forEach(
      ([accountId, delta]) => {
        deltas[accountId] = (deltas[accountId] || 0) + delta;
      },
    );
  });

  return recalculateAccountNames({
    ...previousData,
    expenses: nextExpenses,
    bankAccounts: withUpdatedAccountBalances(
      getAllAccounts(previousData),
      deltas,
    ),
  });
}

export const processSIPDeductions = (
  data: PortfolioData,
  todayISO = getTodayISO(),
) => {
  const manualAndOtherExpenses = data.expenses.filter(
    (entry) => !isSipGeneratedExpense(entry),
  );
  const nextSipExpenses: ExpenseEntry[] = [];
  const mutualFunds = data.investments.mutualFunds.map((fund) => {
    const sip = fund.sipDetails;
    if (!sip) return fund;
    const totalSIPInvested = getComputedSipInvested(sip);
    if (sip.status !== "Active")
      return { ...fund, sipDetails: { ...sip, totalSIPInvested } };
    const anchorDay = new Date(`${sip.startDate}T00:00:00`).getDate();
    const effectiveStart = getLaterDate(
      sip.startDate,
      fund.createdAt?.slice(0, 10),
    );
    let cursor = new Date(`${effectiveStart}T00:00:00`);
    const today = new Date(`${todayISO}T00:00:00`);
    while (cursor <= today) {
      const expectedDate = createSafeDate(
        cursor.getFullYear(),
        cursor.getMonth(),
        anchorDay,
      );
      if (expectedDate <= today && toISODate(expectedDate) >= effectiveStart) {
        const id = `${SIP_AUTO_ID_PREFIX}${fund.id}_${monthKey(expectedDate)}`;
        const generatedExpense: ExpenseEntry = {
          id,
          date: toISODate(expectedDate),
          category: "Investment",
          amount: sip.monthlyAmount,
          fromAccountId: sip.fromAccountId ?? null,
          fromAccountName: sip.fromAccountName ?? null,
          paymentMethod:
            sip.paymentMethod ||
            (sip.fromAccountId && isCashAccount(sip.fromAccountId)
              ? "Cash"
              : "Net Banking"),
          description: `SIP - ${fund.fundName}`,
          isAutoGenerated: true,
          autoSourceId: `${SIP_SOURCE_PREFIX}${fund.id}`,
        };
        const existingEntry = data.expenses.find((entry) => entry.id === id);
        nextSipExpenses.push(
          buildGeneratedInvestmentExpense(existingEntry, generatedExpense),
        );
      }
      cursor = addMonthsSafe(cursor, 1);
    }
    return { ...fund, sipDetails: { ...sip, totalSIPInvested } };
  });
  return {
    expenses: sortByDate([...manualAndOtherExpenses, ...nextSipExpenses]),
    mutualFunds,
  };
};

export const processRDDeductions = (
  data: PortfolioData,
  todayISO = getTodayISO(),
) => {
  const manualAndOtherExpenses = data.expenses.filter(
    (entry) => !isRDGeneratedExpense(entry),
  );
  const generatedExpenses: ExpenseEntry[] = [];
  const today = new Date(`${todayISO}T00:00:00`);
  data.investments.rd.forEach((rd) => {
    const anchorDay = new Date(`${rd.startDate}T00:00:00`).getDate();
    const effectiveStart = getLaterDate(
      rd.startDate,
      rd.createdAt?.slice(0, 10),
    );
    let cursor = new Date(`${effectiveStart}T00:00:00`);
    const maturity = new Date(`${rd.maturityDate}T00:00:00`);
    while (cursor <= today && cursor <= maturity) {
      const expectedDate = createSafeDate(
        cursor.getFullYear(),
        cursor.getMonth(),
        anchorDay,
      );
      if (
        expectedDate <= today &&
        expectedDate <= maturity &&
        toISODate(expectedDate) >= effectiveStart
      ) {
        const id = `${RD_AUTO_ID_PREFIX}${rd.id}_${monthKey(expectedDate)}`;
        const generatedExpense: ExpenseEntry = {
          id,
          date: toISODate(expectedDate),
          category: "Investment",
          amount: rd.monthlyDeposit,
          fromAccountId: rd.fromAccountId ?? null,
          fromAccountName: rd.fromAccountName ?? null,
          paymentMethod:
            rd.paymentMethod ||
            (rd.fromAccountId && isCashAccount(rd.fromAccountId)
              ? "Cash"
              : "Net Banking"),
          description: `RD Instalment - ${rd.bankName}`,
          isAutoGenerated: true,
          autoSourceId: `${RD_SOURCE_PREFIX}${rd.id}`,
        };
        const existingEntry = data.expenses.find((entry) => entry.id === id);
        generatedExpenses.push(
          buildGeneratedInvestmentExpense(existingEntry, generatedExpense),
        );
      }
      cursor = addMonthsSafe(cursor, 1);
    }
  });
  return sortByDate([...manualAndOtherExpenses, ...generatedExpenses]);
};

const getLastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0);

export const getRecurringOccurrences = (
  rule: RecurringRule,
  todayISO = getTodayISO(),
) => {
  const today = new Date(`${todayISO}T00:00:00`);
  const start = new Date(`${rule.startDate}T00:00:00`);
  const end = rule.endDate ? new Date(`${rule.endDate}T00:00:00`) : today;
  const maxDate = end < today ? end : today;
  const dates: string[] = [];
  if (
    [
      "daily",
      "weekdays",
      "weekends",
      "weekly",
      "biweekly",
      "every4weeks",
    ].includes(rule.frequency)
  ) {
    let cursor = new Date(start);
    const step =
      rule.frequency === "weekly"
        ? 7
        : rule.frequency === "biweekly"
          ? 14
          : rule.frequency === "every4weeks"
            ? 28
            : 1;
    while (cursor <= maxDate) {
      const day = cursor.getDay();
      const valid =
        rule.frequency === "daily" ||
        (rule.frequency === "weekdays" && day >= 1 && day <= 5) ||
        (rule.frequency === "weekends" && (day === 0 || day === 6)) ||
        step > 1 ||
        (rule.frequency === "weekly" &&
          (rule.dayOfWeek ?? start.getDay()) === day);
      if (
        valid &&
        (step === 1 ||
          dates.length === 0 ||
          new Date(`${dates[dates.length - 1]}T00:00:00`).getTime() +
            step * 24 * 60 * 60 * 1000 <=
            cursor.getTime())
      )
        dates.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (
    [
      "monthly",
      "endofmonth",
      "every2months",
      "every3months",
      "every4months",
      "every6months",
    ].includes(rule.frequency)
  ) {
    let cursor = new Date(start);
    const monthStep =
      rule.frequency === "monthly" || rule.frequency === "endofmonth"
        ? 1
        : Number(rule.frequency.replace("every", "").replace("months", ""));
    while (cursor <= maxDate) {
      const occurrence =
        rule.frequency === "endofmonth"
          ? getLastDayOfMonth(cursor.getFullYear(), cursor.getMonth())
          : createSafeDate(
              cursor.getFullYear(),
              cursor.getMonth(),
              rule.dayOfMonth || start.getDate(),
            );
      if (occurrence >= start && occurrence <= maxDate)
        dates.push(toISODate(occurrence));
      cursor = addMonthsSafe(cursor, monthStep);
    }
  } else if (rule.frequency === "yearly") {
    let year = start.getFullYear();
    const targetMonth = (rule.monthOfYear || start.getMonth() + 1) - 1;
    const targetDay = rule.dayOfMonth || start.getDate();
    while (year <= maxDate.getFullYear()) {
      const occurrence = createSafeDate(year, targetMonth, targetDay);
      if (occurrence >= start && occurrence <= maxDate)
        dates.push(toISODate(occurrence));
      year += 1;
    }
  }
  return dates;
};

export const processRecurringRules = (
  data: PortfolioData,
  todayISO = getTodayISO(),
) => {
  const expenses = [...data.expenses];
  const recurringRules = data.recurringRules.map((rule) => {
    if (!rule.isActive) return rule;
    const occurrences = getRecurringOccurrences(rule, todayISO);
    occurrences.forEach((occurrence) => {
      const id = `${RECURRING_AUTO_ID_PREFIX}${rule.id}_${occurrence}`;
      if (!expenses.some((entry) => entry.id === id))
        expenses.push({
          id,
          date: occurrence,
          category: rule.category,
          amount: rule.amount,
          fromAccountId: rule.fromAccountId,
          fromAccountName: rule.fromAccountName,
          paymentMethod: rule.paymentMethod,
          description: rule.name,
          isAutoGenerated: true,
          recurringRuleId: rule.id,
        });
    });
    return {
      ...rule,
      lastProcessedMonth: occurrences.length
        ? monthKey(occurrences[occurrences.length - 1])
        : rule.lastProcessedMonth,
    };
  });
  return { recurringRules, expenses: sortByDate(expenses) };
};

export const processAutoGeneratedEntries = (
  data: PortfolioData,
  todayISO = getTodayISO(),
) => {
  const sipResult = processSIPDeductions(data, todayISO);
  const rdExpenses = processRDDeductions(
    {
      ...data,
      expenses: sipResult.expenses,
      investments: { ...data.investments, mutualFunds: sipResult.mutualFunds },
    },
    todayISO,
  );
  const recurringResult = processRecurringRules(
    {
      ...data,
      expenses: rdExpenses,
      investments: { ...data.investments, mutualFunds: sipResult.mutualFunds },
    },
    todayISO,
  );
  const nextData = applyGeneratedExpenseDiff(data, recurringResult.expenses);
  return {
    bankAccounts: nextData.bankAccounts,
    expenses: nextData.expenses,
    investments: { ...data.investments, mutualFunds: sipResult.mutualFunds },
    recurringRules: recurringResult.recurringRules,
  };
};

export const searchPortfolio = (data: PortfolioData, query: string) => {
  const term = query.trim().toLowerCase();
  if (term.length < 3) return [];
  return [
    ...data.expenses
      .filter(
        (entry) =>
          entry.description?.toLowerCase().includes(term) ||
          entry.category.toLowerCase().includes(term),
      )
      .map((entry) => ({
        id: `expense-${entry.id}`,
        label: entry.description || entry.category,
        sublabel: `${entry.category} - ${entry.fromAccountName || "Account?"} - ${formatCurrency(entry.amount)} - ${formatDate(entry.date)}`,
        tab: "transactions",
        kind: "expense" as const,
      })),
    ...data.income
      .filter(
        (entry) =>
          entry.description?.toLowerCase().includes(term) ||
          entry.source.toLowerCase().includes(term),
      )
      .map((entry) => ({
        id: `income-${entry.id}`,
        label: entry.description || entry.source,
        sublabel: `${entry.source} - ${entry.toAccountName || "Account?"} - ${formatCurrency(entry.amount)} - ${formatDate(entry.date)}`,
        tab: "transactions",
        kind: "income" as const,
      })),
    ...data.investments.mutualFunds
      .filter((fund) => fund.fundName.toLowerCase().includes(term))
      .map((fund) => ({
        id: `mf-${fund.id}`,
        label: fund.fundName,
        sublabel: "Mutual Fund",
        tab: "investments",
        kind: "investment" as const,
      })),
    ...data.investments.stockPortfolios.flatMap((portfolio) =>
      portfolio.holdings
        .filter(
          (holding) =>
            normalizeStockName(holding.companyName)
              .toLowerCase()
              .includes(term) || holding.ticker.toLowerCase().includes(term),
        )
        .map((holding) => ({
          id: `stock-${holding.id}`,
          label: normalizeStockName(holding.companyName),
          sublabel: `${portfolio.name} - ${holding.ticker}`,
          tab: "investments",
          kind: "investment" as const,
        })),
    ),
  ].slice(0, 12);
};

export const getPrintSummary = (data: PortfolioData) => ({
  combinedStocks: getCombinedStockHoldings(data),
  threeMonthCashflow: getMonthlyCashflowSeries(data, 3, data.settings.yearView),
});

export const getRecurringDepositMonthlyStatus = (rd: RecurringDeposit) =>
  `${formatCurrency(rd.monthlyDeposit)}/month`;

// ── Upcoming projection (read-only, no materialisation) ──────────────────────

export type UpcomingItem = {
  date: string;
  label: string;
  amount: number;
  kind: "recurring" | "sip" | "rd";
};

/**
 * Returns all recurring-rule, SIP, and RD occurrences whose date falls in the
 * half-open window (todayISO, todayISO + daysAhead].  Uses the same
 * getRecurringOccurrences logic for rules; SIP/RD use the anchor-day pattern.
 * Pure projection — no expense entries are created or modified.
 */
export const getUpcomingInNext7Days = (
  data: PortfolioData,
  todayISO = getTodayISO(),
  daysAhead = 7,
): UpcomingItem[] => {
  const today = new Date(`${todayISO}T00:00:00`);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + daysAhead);
  const horizonISO = toISODate(horizon);

  const items: UpcomingItem[] = [];

  // Recurring rules — delegate to getRecurringOccurrences with the horizon as
  // the ceiling, then keep only dates strictly after today.
  data.recurringRules
    .filter((rule) => rule.isActive)
    .forEach((rule) => {
      getRecurringOccurrences(rule, horizonISO)
        .filter((d) => d > todayISO)
        .forEach((date) =>
          items.push({
            date,
            label: rule.name,
            amount: rule.amount,
            kind: "recurring",
          }),
        );
    });

  // Active SIPs — find the anchor day and check this month + next.
  data.investments.mutualFunds.forEach((fund) => {
    const sip = fund.sipDetails;
    if (!sip || sip.status !== "Active") return;
    const anchorDay = new Date(`${sip.startDate}T00:00:00`).getDate();
    for (let offset = 0; offset <= 1; offset += 1) {
      const d = createSafeDate(
        today.getFullYear(),
        today.getMonth() + offset,
        anchorDay,
      );
      const iso = toISODate(d);
      if (iso > todayISO && iso <= horizonISO)
        items.push({
          date: iso,
          label: `${fund.fundName} SIP`,
          amount: sip.monthlyAmount,
          kind: "sip",
        });
    }
  });

  // RDs — same anchor-day pattern, skip matured ones.
  data.investments.rd.forEach((rd) => {
    if (new Date(`${rd.maturityDate}T00:00:00`) <= today) return;
    const anchorDay = new Date(`${rd.startDate}T00:00:00`).getDate();
    for (let offset = 0; offset <= 1; offset += 1) {
      const d = createSafeDate(
        today.getFullYear(),
        today.getMonth() + offset,
        anchorDay,
      );
      const iso = toISODate(d);
      if (iso > todayISO && iso <= horizonISO && iso <= rd.maturityDate)
        items.push({
          date: iso,
          label: `${rd.bankName} RD`,
          amount: rd.monthlyDeposit,
          kind: "rd",
        });
    }
  });

  return items.sort((a, b) => a.date.localeCompare(b.date));
};

// ── Recurring-rule edit with explicit apply scope ─────────────────────────────

/**
 * Saves an edited recurring rule.
 * - "forward": update the rule only; existing auto-generated entries keep their
 *   old amounts/categories (default — safe, preserves history).
 * - "backfill": also rewrite amount + category on every past auto-generated
 *   expense whose recurringRuleId matches, adjusting account balances.
 */
export const applyRecurringRuleEdit = (
  data: PortfolioData,
  newRule: RecurringRule,
  backfill: boolean,
): PortfolioData => {
  const updatedRules = data.recurringRules.map((r) =>
    r.id === newRule.id ? newRule : r,
  );

  if (!backfill) {
    return recalculateAccountNames({ ...data, recurringRules: updatedRules });
  }

  // Backfill: update amount + category on existing auto-generated entries for
  // this rule and recompute the account-balance deltas.
  const balanceDeltas: Record<string, number> = {};
  const updatedExpenses = data.expenses.map((entry) => {
    if (entry.recurringRuleId !== newRule.id || !entry.isAutoGenerated)
      return entry;
    if (entry.fromAccountId) {
      // Old entry reduced balance by entry.amount; new one reduces by newRule.amount.
      // Net correction = oldAmount - newAmount (positive means balance goes up).
      balanceDeltas[entry.fromAccountId] =
        (balanceDeltas[entry.fromAccountId] || 0) +
        (entry.amount - newRule.amount);
    }
    return { ...entry, amount: newRule.amount, category: newRule.category };
  });

  return recalculateAccountNames({
    ...data,
    recurringRules: updatedRules,
    expenses: updatedExpenses,
    bankAccounts: withUpdatedAccountBalances(
      getAllAccounts(data),
      balanceDeltas,
    ),
  });
};
