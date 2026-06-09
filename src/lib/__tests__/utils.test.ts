import { describe, it, expect, vi } from "vitest";
import {
  getIncomeBalanceDelta,
  getExpenseBalanceDelta,
  getTransferBalanceDelta,
  combineBalanceDeltas,
  invertDeltas,
  saveExpenseEntry,
  deleteExpenseEntry,
  saveIncomeEntry,
  deleteIncomeEntry,
  saveTransferEntry,
  deleteTransferEntry,
  calculateSIPInvested,
  getComputedSipInvested,
  calculateRDValue,
  calculateFDValue,
  getRecurringOccurrences,
  getCombinedStockHoldings,
  computeAccountBalance,
  countUnlinkedTransactions,
  getUpcomingInNext7Days,
  SIP_AUTO_ID_PREFIX,
  RD_AUTO_ID_PREFIX,
  RECURRING_AUTO_ID_PREFIX,
  SIP_SOURCE_PREFIX,
  RD_SOURCE_PREFIX,
} from "../utils";
import { INITIAL_DATA } from "../storage";
import type {
  BankAccount,
  ExpenseEntry,
  IncomeEntry,
  PortfolioData,
  RecurringRule,
  StockPortfolio,
  TransferEntry,
} from "../../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeAccount(
  id: string,
  balance = 1000,
  openingBalance?: number,
): BankAccount {
  return {
    id,
    bankName: id,
    accountType: "Savings",
    accountNumber: "",
    balance,
    openingBalance,
  };
}

function makeData(accounts: BankAccount[]): PortfolioData {
  return {
    ...INITIAL_DATA,
    bankAccounts: accounts,
    income: [],
    expenses: [],
    transfers: [],
  };
}

function makeIncome(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: "inc-1",
    date: "2025-01-15",
    source: "Salary",
    amount: 5000,
    toAccountId: "acc-a",
    toAccountName: "A",
    ...overrides,
  };
}

function makeExpense(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "exp-1",
    date: "2025-01-15",
    category: "Food",
    amount: 500,
    fromAccountId: "acc-a",
    fromAccountName: "A",
    paymentMethod: "UPI",
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<TransferEntry> = {}): TransferEntry {
  return {
    id: "txn-1",
    date: "2025-01-15",
    amount: 2000,
    fromAccountId: "acc-a",
    fromAccountName: "A",
    toAccountId: "acc-b",
    toAccountName: "B",
    fees: 0,
    ...overrides,
  };
}

function makeRule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: "rule-1",
    name: "Rent",
    amount: 1000,
    category: "Rent",
    paymentMethod: "Net Banking",
    fromAccountId: null,
    fromAccountName: null,
    frequency: "monthly",
    startDate: "2025-01-01",
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

// ─── Balance delta functions ───────────────────────────────────────────────────

describe("getIncomeBalanceDelta", () => {
  it("credits the toAccount by the income amount", () => {
    const entry = makeIncome({ amount: 5000, toAccountId: "acc-a" });
    expect(getIncomeBalanceDelta(entry)).toEqual({ "acc-a": 5000 });
  });

  it("returns an empty object when toAccountId is null", () => {
    const entry = makeIncome({ toAccountId: null });
    expect(getIncomeBalanceDelta(entry)).toEqual({});
  });
});

describe("getExpenseBalanceDelta", () => {
  it("debits the fromAccount by the expense amount", () => {
    const entry = makeExpense({ amount: 300, fromAccountId: "acc-b" });
    expect(getExpenseBalanceDelta(entry)).toEqual({ "acc-b": -300 });
  });

  it("returns an empty object when fromAccountId is null", () => {
    const entry = makeExpense({ fromAccountId: null });
    expect(getExpenseBalanceDelta(entry)).toEqual({});
  });
});

describe("getTransferBalanceDelta", () => {
  it("debits from + fees from source, credits amount to dest", () => {
    const entry = makeTransfer({
      amount: 1000,
      fees: 50,
      fromAccountId: "acc-a",
      toAccountId: "acc-b",
    });
    expect(getTransferBalanceDelta(entry)).toEqual({
      "acc-a": -1050,
      "acc-b": 1000,
    });
  });

  it("works with zero fees", () => {
    const entry = makeTransfer({
      amount: 500,
      fees: 0,
      fromAccountId: "acc-x",
      toAccountId: "acc-y",
    });
    expect(getTransferBalanceDelta(entry)).toEqual({
      "acc-x": -500,
      "acc-y": 500,
    });
  });
});

describe("combineBalanceDeltas", () => {
  it("merges multiple delta objects, summing overlapping keys", () => {
    const result = combineBalanceDeltas(
      { "acc-a": 100, "acc-b": -50 },
      { "acc-a": 200, "acc-c": 300 },
    );
    expect(result).toEqual({ "acc-a": 300, "acc-b": -50, "acc-c": 300 });
  });

  it("returns empty object when called with no args", () => {
    expect(combineBalanceDeltas()).toEqual({});
  });

  it("returns a copy of the single arg when called with one delta", () => {
    expect(combineBalanceDeltas({ x: 10 })).toEqual({ x: 10 });
  });
});

describe("invertDeltas", () => {
  it("negates all values", () => {
    expect(invertDeltas({ "acc-a": 500, "acc-b": -200 })).toEqual({
      "acc-a": -500,
      "acc-b": 200,
    });
  });

  it("returns an empty object for empty input", () => {
    expect(invertDeltas({})).toEqual({});
  });
});

// ─── Save / delete round-trips ─────────────────────────────────────────────────

describe("saveExpenseEntry then deleteExpenseEntry nets to zero", () => {
  it("restores account balance after a round-trip", () => {
    const initial = makeData([makeAccount("acc-a", 1000)]);
    const expense = makeExpense({ amount: 400, fromAccountId: "acc-a" });

    const afterSave = saveExpenseEntry(initial, expense);
    const accAfterSave = afterSave.bankAccounts.find((a) => a.id === "acc-a")!;
    expect(accAfterSave.balance).toBe(600);

    const afterDelete = deleteExpenseEntry(afterSave, expense);
    const accAfterDelete = afterDelete.bankAccounts.find(
      (a) => a.id === "acc-a",
    )!;
    expect(accAfterDelete.balance).toBe(1000);
  });
});

describe("saveIncomeEntry then deleteIncomeEntry nets to zero", () => {
  it("restores account balance after a round-trip", () => {
    const initial = makeData([makeAccount("acc-a", 500)]);
    const income = makeIncome({ amount: 3000, toAccountId: "acc-a" });

    const afterSave = saveIncomeEntry(initial, income);
    expect(afterSave.bankAccounts.find((a) => a.id === "acc-a")!.balance).toBe(
      3500,
    );

    const afterDelete = deleteIncomeEntry(afterSave, income);
    expect(
      afterDelete.bankAccounts.find((a) => a.id === "acc-a")!.balance,
    ).toBe(500);
  });
});

describe("saveTransferEntry then deleteTransferEntry nets to zero", () => {
  it("restores both account balances after a round-trip", () => {
    const initial = makeData([
      makeAccount("acc-a", 2000),
      makeAccount("acc-b", 500),
    ]);
    const transfer = makeTransfer({
      amount: 800,
      fees: 10,
      fromAccountId: "acc-a",
      toAccountId: "acc-b",
    });

    const afterSave = saveTransferEntry(initial, transfer);
    expect(afterSave.bankAccounts.find((a) => a.id === "acc-a")!.balance).toBe(
      1190,
    );
    expect(afterSave.bankAccounts.find((a) => a.id === "acc-b")!.balance).toBe(
      1300,
    );

    const afterDelete = deleteTransferEntry(afterSave, transfer);
    expect(
      afterDelete.bankAccounts.find((a) => a.id === "acc-a")!.balance,
    ).toBe(2000);
    expect(
      afterDelete.bankAccounts.find((a) => a.id === "acc-b")!.balance,
    ).toBe(500);
  });
});

// ─── SIP math ─────────────────────────────────────────────────────────────────

describe("calculateSIPInvested", () => {
  it("Stopped: uses stoppedDate, ignores today", () => {
    // Jan 2024 → Mar 2024 inclusive = 3 months
    const result = calculateSIPInvested(
      5000,
      "2024-01-01",
      "Stopped",
      "2024-03-31",
    );
    expect(result).toBe(15000);
  });

  it("Stopped without stoppedDate falls back to today (non-zero)", () => {
    // start well in the past, no stoppedDate → uses today; result > 0
    const result = calculateSIPInvested(
      1000,
      "2020-01-01",
      "Stopped",
      undefined,
    );
    expect(result).toBeGreaterThan(0);
  });

  it("Active: uses today (result grows over time, non-zero for past start)", () => {
    // Started Jan 2020 — regardless of when tests run, many months have passed
    const result = calculateSIPInvested(1000, "2020-01-01", "Active");
    expect(result).toBeGreaterThan(0);
  });

  it("Active: uses fake timer for deterministic result", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-30T12:00:00Z"));
    // Jan 2025 → Apr 2025 inclusive: 4 months
    const result = calculateSIPInvested(2000, "2025-01-01", "Active");
    expect(result).toBe(8000);
    vi.useRealTimers();
  });
});

describe("getComputedSipInvested", () => {
  it("returns 0 when sipDetails is undefined", () => {
    expect(getComputedSipInvested(undefined)).toBe(0);
  });

  it("delegates to calculateSIPInvested for Stopped SIP", () => {
    const result = getComputedSipInvested({
      monthlyAmount: 3000,
      startDate: "2024-06-01",
      status: "Stopped",
      stoppedDate: "2024-08-31",
    });
    // Jun → Aug inclusive = 3 months
    expect(result).toBe(9000);
  });
});

// ─── RD value ─────────────────────────────────────────────────────────────────

describe("calculateRDValue", () => {
  it("returns monthly deposit when today is before start date", () => {
    vi.useFakeTimers();
    // Set today to May 2025 so it is clearly before the June 2025 start date.
    vi.setSystemTime(new Date("2025-05-01T00:00:00Z"));
    const value = calculateRDValue(5000, 7, "2025-06-01", "2026-06-01");
    // now <= start → returns monthlyDeposit
    expect(value).toBe(5000);
    vi.useRealTimers();
  });

  it("returns a value greater than total deposited after 6 months (interest accrued)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-01T00:00:00Z"));
    // start Jan 2025, maturity Jan 2026 → 6 months elapsed
    const value = calculateRDValue(5000, 7, "2025-01-01", "2026-01-01");
    const minDeposited = 5000 * 6; // 30000
    expect(value).toBeGreaterThan(minDeposited);
    vi.useRealTimers();
  });

  it("caps at maturity value once past maturity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const atMaturity = calculateRDValue(5000, 7, "2025-01-01", "2026-01-01");
    vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
    const afterMaturity = calculateRDValue(5000, 7, "2025-01-01", "2026-01-01");
    expect(afterMaturity).toBeCloseTo(atMaturity, 2);
    vi.useRealTimers();
  });
});

// ─── FD value ─────────────────────────────────────────────────────────────────

describe("calculateFDValue", () => {
  it("returns principal when start is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    const value = calculateFDValue(100000, 7, "2025-06-01", "2026-06-01");
    expect(value).toBe(100000);
    vi.useRealTimers();
  });

  it("returns a value greater than principal after 1 year at 7%", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const value = calculateFDValue(100000, 7, "2025-06-01", "2027-06-01");
    expect(value).toBeGreaterThan(100000);
    vi.useRealTimers();
  });

  it("grows with interest after 1 year (between principal and maturity value)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const value = calculateFDValue(100000, 8, "2025-06-01", "2027-06-01");
    // After ~1 year at 8%, value should be ~108k — sanity-check the range
    expect(value).toBeGreaterThan(108000);
    expect(value).toBeLessThan(109000);
    vi.useRealTimers();
  });

  it("caps at maturity value once past maturity date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    const atMaturity = calculateFDValue(100000, 7, "2025-01-01", "2027-01-01");
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const afterMaturity = calculateFDValue(
      100000,
      7,
      "2025-01-01",
      "2027-01-01",
    );
    expect(afterMaturity).toBeCloseTo(atMaturity, 2);
    vi.useRealTimers();
  });
});

// ─── Recurring occurrences ─────────────────────────────────────────────────────

describe("getRecurringOccurrences", () => {
  const TODAY = "2025-03-31";

  it("daily — generates one entry per day in range", () => {
    const rule = makeRule({
      frequency: "daily",
      startDate: "2025-03-28",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual([
      "2025-03-28",
      "2025-03-29",
      "2025-03-30",
      "2025-03-31",
    ]);
  });

  it("weekly — generates same weekday each week", () => {
    // 2025-03-03 is a Monday
    const rule = makeRule({
      frequency: "weekly",
      startDate: "2025-03-03",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    // Mondays: Mar 3, 10, 17, 24, 31
    expect(dates).toEqual([
      "2025-03-03",
      "2025-03-10",
      "2025-03-17",
      "2025-03-24",
      "2025-03-31",
    ]);
  });

  it("monthly — generates on the same day-of-month each month", () => {
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-15",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual(["2025-01-15", "2025-02-15", "2025-03-15"]);
  });

  it("endofmonth — generates on the last day of each month", () => {
    const rule = makeRule({
      frequency: "endofmonth",
      startDate: "2025-01-01",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
  });

  it("every3months — generates one entry every 3 months", () => {
    const rule = makeRule({
      frequency: "every3months",
      startDate: "2024-09-01",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual(["2024-09-01", "2024-12-01", "2025-03-01"]);
  });

  it("yearly — generates once per year on the same date", () => {
    const rule = makeRule({
      frequency: "yearly",
      startDate: "2023-06-15",
      endDate: "2025-03-31",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual(["2023-06-15", "2024-06-15"]);
  });

  it("returns empty array when today is before startDate", () => {
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2026-01-01",
      endDate: null,
    });
    const dates = getRecurringOccurrences(rule, "2025-01-01");
    expect(dates).toEqual([]);
  });

  it("respects endDate, not extending beyond it", () => {
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-01",
      endDate: "2025-02-28",
    });
    const dates = getRecurringOccurrences(rule, TODAY);
    expect(dates).toEqual(["2025-01-01", "2025-02-01"]);
  });
});

// ─── Stock merge ───────────────────────────────────────────────────────────────

describe("getCombinedStockHoldings", () => {
  function makePortfolio(
    id: string,
    owner: string,
    holdings: StockPortfolio["holdings"],
  ): StockPortfolio {
    return {
      id,
      name: `${owner} Portfolio`,
      ownerName: owner,
      broker: "Groww",
      holdings,
    };
  }

  it("merges holdings of the same stock across two portfolios", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      investments: {
        ...INITIAL_DATA.investments,
        stockPortfolios: [
          makePortfolio("p1", "Alice", [
            {
              id: "s1",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 10,
              avgBuyPrice: 1500,
              currentPrice: 1600,
            },
          ]),
          makePortfolio("p2", "Bob", [
            {
              id: "s2",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 5,
              avgBuyPrice: 1700,
              currentPrice: 1600,
            },
          ]),
        ],
      },
    };

    const combined = getCombinedStockHoldings(data);
    expect(combined).toHaveLength(1);
    expect(combined[0].totalQty).toBe(15);
    expect(combined[0].totalInvested).toBe(10 * 1500 + 5 * 1700);
    expect(combined[0].totalCurrentValue).toBe(15 * 1600);
    expect(combined[0].portfolios).toContain("Alice/Groww");
    expect(combined[0].portfolios).toContain("Bob/Groww");
  });

  it("keeps different stocks as separate entries", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      investments: {
        ...INITIAL_DATA.investments,
        stockPortfolios: [
          makePortfolio("p1", "Alice", [
            {
              id: "s1",
              companyName: "HDFC Bank Limited",
              ticker: "HDFCBANK",
              quantity: 20,
              avgBuyPrice: 1800,
              currentPrice: 1900,
            },
            {
              id: "s2",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 10,
              avgBuyPrice: 1500,
              currentPrice: 1600,
            },
          ]),
        ],
      },
    };

    const combined = getCombinedStockHoldings(data);
    expect(combined).toHaveLength(2);
    const names = combined.map((h) => h.name);
    expect(names).toContain("HDFC Bank Limited");
    expect(names).toContain("Infosys Limited");
  });

  it("sorts by totalCurrentValue descending", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      investments: {
        ...INITIAL_DATA.investments,
        stockPortfolios: [
          makePortfolio("p1", "Alice", [
            {
              id: "s1",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 1,
              avgBuyPrice: 100,
              currentPrice: 100,
            },
            {
              id: "s2",
              companyName: "HDFC Bank Limited",
              ticker: "HDFCBANK",
              quantity: 100,
              avgBuyPrice: 200,
              currentPrice: 200,
            },
          ]),
        ],
      },
    };
    const combined = getCombinedStockHoldings(data);
    expect(combined[0].name).toBe("HDFC Bank Limited");
  });

  it("returns empty array when no portfolios", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      investments: { ...INITIAL_DATA.investments, stockPortfolios: [] },
    };
    expect(getCombinedStockHoldings(data)).toEqual([]);
  });

  it("computes weighted average price correctly", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      investments: {
        ...INITIAL_DATA.investments,
        stockPortfolios: [
          makePortfolio("p1", "Alice", [
            {
              id: "s1",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 10,
              avgBuyPrice: 1000,
              currentPrice: 1200,
            },
          ]),
          makePortfolio("p2", "Bob", [
            {
              id: "s2",
              companyName: "Infosys Limited",
              ticker: "INFY",
              quantity: 10,
              avgBuyPrice: 2000,
              currentPrice: 1200,
            },
          ]),
        ],
      },
    };
    const combined = getCombinedStockHoldings(data);
    // (10*1000 + 10*2000) / 20 = 1500
    expect(combined[0].weightedAvgPrice).toBe(1500);
  });
});

// ─── computeAccountBalance ────────────────────────────────────────────────────

describe("computeAccountBalance", () => {
  it("returns undefined when openingBalance is not set", () => {
    const data = makeData([makeAccount("acc-a", 1000)]);
    expect(computeAccountBalance(data, "acc-a")).toBeUndefined();
  });

  it("returns undefined for an unknown account id", () => {
    const data = makeData([makeAccount("acc-a", 1000, 1000)]);
    expect(computeAccountBalance(data, "acc-z")).toBeUndefined();
  });

  it("equals openingBalance when there are no transactions", () => {
    const data = makeData([makeAccount("acc-a", 1000, 500)]);
    expect(computeAccountBalance(data, "acc-a")).toBe(500);
  });

  it("adds income credited to the account", () => {
    const data: PortfolioData = {
      ...makeData([makeAccount("acc-a", 1000, 0)]),
      income: [makeIncome({ amount: 3000, toAccountId: "acc-a" })],
    };
    expect(computeAccountBalance(data, "acc-a")).toBe(3000);
  });

  it("subtracts expenses debited from the account", () => {
    const data: PortfolioData = {
      ...makeData([makeAccount("acc-a", 1000, 5000)]),
      expenses: [makeExpense({ amount: 400, fromAccountId: "acc-a" })],
    };
    expect(computeAccountBalance(data, "acc-a")).toBe(4600);
  });

  it("adds transfer-in and deducts transfer-out plus fees", () => {
    const data: PortfolioData = {
      ...makeData([
        makeAccount("acc-a", 1000, 10000),
        makeAccount("acc-b", 500, 500),
      ]),
      transfers: [
        makeTransfer({
          amount: 2000,
          fees: 50,
          fromAccountId: "acc-a",
          toAccountId: "acc-b",
        }),
      ],
    };
    // acc-a: 10000 - 2000 - 50 = 7950
    expect(computeAccountBalance(data, "acc-a")).toBe(7950);
    // acc-b: 500 + 2000 = 2500
    expect(computeAccountBalance(data, "acc-b")).toBe(2500);
  });

  it("handles multiple mixed transactions correctly", () => {
    const data: PortfolioData = {
      ...makeData([makeAccount("acc-a", 0, 1000)]),
      income: [makeIncome({ amount: 5000, toAccountId: "acc-a" })],
      expenses: [makeExpense({ amount: 800, fromAccountId: "acc-a" })],
      transfers: [
        makeTransfer({
          amount: 500,
          fees: 10,
          fromAccountId: "acc-a",
          toAccountId: "acc-b",
        }),
      ],
    };
    // 1000 + 5000 - 800 - 500 - 10 = 4690
    expect(computeAccountBalance(data, "acc-a")).toBe(4690);
  });

  it("ignores income/expenses/transfers linked to other accounts", () => {
    const data: PortfolioData = {
      ...makeData([makeAccount("acc-a", 0, 2000), makeAccount("acc-b", 0, 0)]),
      income: [makeIncome({ amount: 1000, toAccountId: "acc-b" })],
      expenses: [makeExpense({ amount: 500, fromAccountId: "acc-b" })],
    };
    // acc-a has no transactions → equals its openingBalance
    expect(computeAccountBalance(data, "acc-a")).toBe(2000);
  });

  it("detects drift when stored balance differs from computed", () => {
    // Simulate a stored balance that drifted after an import
    const openingBalance = 0;
    const data: PortfolioData = {
      ...makeData([makeAccount("acc-a", 9999 /* drifted */, openingBalance)]),
      income: [makeIncome({ amount: 5000, toAccountId: "acc-a" })],
      expenses: [makeExpense({ amount: 500, fromAccountId: "acc-a" })],
    };
    const computed = computeAccountBalance(data, "acc-a")!;
    expect(computed).toBe(4500);
    // stored balance (9999) differs from computed (4500) by more than ₹1 → drift
    const storedBalance = data.bankAccounts.find(
      (a) => a.id === "acc-a",
    )!.balance;
    expect(Math.abs(computed - storedBalance)).toBeGreaterThan(1);
  });
});

// ─── Auto-entry ID constants (FP-0 constants refactor) ────────────────────────
// These tests verify that the exported constants equal the historically hard-coded
// strings, so the refactor is a pure rename with zero behaviour change.

describe("auto-entry ID constant values", () => {
  it("SIP_AUTO_ID_PREFIX equals the original inline literal", () => {
    expect(SIP_AUTO_ID_PREFIX).toBe("sip_auto_");
  });
  it("RD_AUTO_ID_PREFIX equals the original inline literal", () => {
    expect(RD_AUTO_ID_PREFIX).toBe("rd_auto_");
  });
  it("RECURRING_AUTO_ID_PREFIX equals the original inline literal", () => {
    expect(RECURRING_AUTO_ID_PREFIX).toBe("rec_");
  });
  it("SIP_SOURCE_PREFIX equals the original inline literal", () => {
    expect(SIP_SOURCE_PREFIX).toBe("sip:");
  });
  it("RD_SOURCE_PREFIX equals the original inline literal", () => {
    expect(RD_SOURCE_PREFIX).toBe("rd:");
  });
});

describe("auto-entry identity via countUnlinkedTransactions", () => {
  it("SIP-generated expense (id prefix) is not counted as unlinked despite no fromAccountId", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      bankAccounts: [],
      income: [],
      transfers: [],
      expenses: [
        makeExpense({
          id: `${SIP_AUTO_ID_PREFIX}fund-1_2025-01`,
          fromAccountId: null,
          fromAccountName: null,
          isAutoGenerated: true,
          autoSourceId: `${SIP_SOURCE_PREFIX}fund-1`,
        }),
      ],
    };
    expect(countUnlinkedTransactions(data)).toBe(0);
  });

  it("SIP-generated expense (autoSourceId prefix) is not counted as unlinked", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      bankAccounts: [],
      income: [],
      transfers: [],
      expenses: [
        makeExpense({
          id: "some_other_id",
          fromAccountId: null,
          fromAccountName: null,
          isAutoGenerated: true,
          autoSourceId: `${SIP_SOURCE_PREFIX}fund-2`,
        }),
      ],
    };
    expect(countUnlinkedTransactions(data)).toBe(0);
  });

  it("RD-generated expense (id prefix) is not counted as unlinked despite no fromAccountId", () => {
    const data: PortfolioData = {
      ...INITIAL_DATA,
      bankAccounts: [],
      income: [],
      transfers: [],
      expenses: [
        makeExpense({
          id: `${RD_AUTO_ID_PREFIX}rd-1_2025-01`,
          fromAccountId: null,
          fromAccountName: null,
          isAutoGenerated: true,
          autoSourceId: `${RD_SOURCE_PREFIX}rd-1`,
        }),
      ],
    };
    expect(countUnlinkedTransactions(data)).toBe(0);
  });

  it("recurring-rule auto entry without fromAccountId IS counted as unlinked", () => {
    // Recurring rule entries are regular cash expenses — they should have an account
    const data: PortfolioData = {
      ...INITIAL_DATA,
      bankAccounts: [],
      income: [],
      transfers: [],
      expenses: [
        makeExpense({
          id: `${RECURRING_AUTO_ID_PREFIX}rule-1_2025-01-15`,
          fromAccountId: null,
          fromAccountName: null,
          isAutoGenerated: true,
          recurringRuleId: "rule-1",
        }),
      ],
    };
    expect(countUnlinkedTransactions(data)).toBe(1);
  });
});

// ─── getUpcomingInNext7Days ────────────────────────────────────────────────────

describe("getUpcomingInNext7Days", () => {
  const TODAY = "2025-03-10"; // Monday

  function makePortfolioData(
    overrides: Partial<PortfolioData> = {},
  ): PortfolioData {
    return {
      ...INITIAL_DATA,
      bankAccounts: [],
      income: [],
      expenses: [],
      transfers: [],
      ...overrides,
    };
  }

  it("returns empty array when there are no rules, SIPs, or RDs", () => {
    expect(getUpcomingInNext7Days(makePortfolioData(), TODAY)).toEqual([]);
  });

  it("includes a monthly rule occurrence that falls within 7 days", () => {
    // Rule fires on the 12th; today is the 10th → 12th is 2 days out, inside window.
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-12",
      endDate: null,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY);
    expect(items.some((i) => i.date === "2025-03-12")).toBe(true);
  });

  it("excludes today — only strictly-future dates are returned", () => {
    // Rule fires on the 10th (today); should NOT appear.
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-10",
      endDate: null,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY);
    expect(items.every((i) => i.date > TODAY)).toBe(true);
  });

  it("excludes dates beyond daysAhead", () => {
    // Rule fires on the 20th — 10 days out, outside default 7-day window.
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-20",
      endDate: null,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY);
    expect(items.some((i) => i.date === "2025-03-20")).toBe(false);
  });

  it("respects daysAhead parameter", () => {
    // With daysAhead=14, the 20th (10 days out) should appear.
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-20",
      endDate: null,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY, 14);
    expect(items.some((i) => i.date === "2025-03-20")).toBe(true);
  });

  it("skips inactive rules", () => {
    const rule = makeRule({
      frequency: "monthly",
      startDate: "2025-01-12",
      endDate: null,
      isActive: false,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    expect(getUpcomingInNext7Days(data, TODAY)).toEqual([]);
  });

  it("includes weekly occurrences in the window", () => {
    // Rule starts on a Monday (2025-03-03), fires weekly.
    // Next after today (03-10, Monday) would be 03-10 itself (excluded) then 03-17.
    // 03-17 is 7 days out — exactly at the horizon, should be included (<=).
    const rule = makeRule({
      frequency: "weekly",
      startDate: "2025-03-03",
      endDate: null,
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY);
    expect(items.some((i) => i.date === "2025-03-17")).toBe(true);
  });

  it("returns results sorted by date ascending", () => {
    const rule1 = makeRule({
      id: "r1",
      frequency: "monthly",
      startDate: "2025-01-15",
    });
    const rule2 = makeRule({
      id: "r2",
      name: "Earlier",
      frequency: "monthly",
      startDate: "2025-01-11",
    });
    const data = makePortfolioData({ recurringRules: [rule1, rule2] });
    const items = getUpcomingInNext7Days(data, TODAY);
    const dates = items.map((i) => i.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("includes amount and label from the rule", () => {
    const rule = makeRule({
      name: "Rent",
      amount: 12000,
      frequency: "monthly",
      startDate: "2025-01-12",
    });
    const data = makePortfolioData({ recurringRules: [rule] });
    const items = getUpcomingInNext7Days(data, TODAY);
    const item = items.find((i) => i.date === "2025-03-12")!;
    expect(item.label).toBe("Rent");
    expect(item.amount).toBe(12000);
    expect(item.kind).toBe("recurring");
  });
});
