import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { PortfolioData } from "../types";
import {
  calculateFDValue,
  calculateRDInvested,
  calculateRDValue,
  filterByMonth,
  getAllAccounts,
  getCombinedStockHoldings,
  getComputedSipInvested,
  getExpenseCategories,
  getMutualFundInvestedAmount,
  getTodayISO,
} from "../lib/utils";

function formatINR(amount: number, options?: { maximumFractionDigits?: number }) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  }).format(abs)}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
}

function classForTone(tone: "emerald" | "rose" | "amber" | "sky" | "violet" | "slate") {
  return {
    emerald: "var(--pos)",
    rose: "var(--neg)",
    amber: "var(--warn)",
    sky: "var(--info)",
    violet: "var(--violet)",
    slate: "var(--ink-3)",
  }[tone];
}

function Card({
  children,
  className = "",
  padded = true,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[20px] bg-[color:var(--bg-2)] hairline ${padded ? "p-4" : ""} ${onClick ? "cursor-pointer transition active:scale-[0.995]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function Chip({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "rose" | "amber" | "sky" | "violet";
}) {
  const color = classForTone(tone);
  const isSlate = tone === "slate";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.08em]"
      style={{
        color: isSlate ? "var(--ink-3)" : color,
        background: isSlate ? "rgba(255,255,255,0.03)" : `color-mix(in oklch, ${color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px ${isSlate ? "rgba(255,255,255,0.10)" : `color-mix(in oklch, ${color} 22%, transparent)`}`,
      }}
    >
      {children}
    </span>
  );
}

function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between px-1 pt-4 pb-2">
      <h3 className="font-display text-[15px] font-semibold text-[color:var(--ink)]">{title}</h3>
      {action}
    </div>
  );
}

function Bars({
  series,
  height = 40,
  color = "var(--accent)",
}: {
  series: number[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {series.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(4, (value / max) * height)}px`,
            background: value === 0 ? "rgba(255,255,255,.06)" : `color-mix(in oklch, ${color} ${60 + (value / max) * 40}%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

function Ring({
  value,
  size = 88,
  stroke = 10,
  color = "var(--accent)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, value)));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="ring-value"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Donut({
  data,
  size = 140,
  thick = 18,
}: {
  data: Array<{ label: string; amount: number; color: string }>;
  size?: number;
  thick?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const radius = (size - thick) / 2;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  if (!total) {
    return (
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#131b28" strokeWidth={thick} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">Spent</div>
          <div className="font-display text-[18px] font-semibold">₹0</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#131b28" strokeWidth={thick} />
        {data.map((item, index) => {
          const fraction = item.amount / total;
          const dash = circumference * fraction;
          const offset = circumference - acc;
          acc += dash;
          return (
            <circle
              key={`${item.label}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={thick}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">Spent</div>
        <div className="font-display text-[22px] font-semibold tabular">{formatINR(total)}</div>
        <div className="text-[11px] text-[color:var(--ink-3)]">selected</div>
      </div>
    </div>
  );
}

function getAccountColor(index: number) {
  const colors = [
    "oklch(.70 .14 235)",
    "oklch(.70 .14 35)",
    "oklch(.70 .14 295)",
    "oklch(.70 .14 90)",
  ];
  return colors[index % colors.length];
}

function getAccountShort(name: string) {
  const clean = name.trim();
  if (/cash/i.test(clean)) return "₹";
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("").slice(0, 2) || "AC";
}

function BankBadge({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-[10px] font-display font-semibold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklch, ${color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 40%, transparent)`,
        color,
        fontSize: size * 0.38,
      }}
    >
      {getAccountShort(name)}
    </div>
  );
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function getStockPortfolioTotals(data: PortfolioData) {
  return data.investments.stockPortfolios.map((portfolio) => {
    const totals = portfolio.holdings.reduce(
      (sum, holding) => ({
        invested: sum.invested + holding.quantity * holding.avgBuyPrice,
        current: sum.current + holding.quantity * holding.currentPrice,
      }),
      { invested: 0, current: 0 },
    );
    return { portfolio, totals };
  });
}

function buildLoanUpcoming(data: PortfolioData, today: Date) {
  return data.loans.map((loan) => {
    const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), Math.min(loan.emiDate, getDaysInMonth(today)));
    const isLate = dueThisMonth < today;
    const dueDate = isLate ? dueThisMonth : dueThisMonth;
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);

    return {
      id: `loan-${loan.id}`,
      icon: "credit-card" as const,
      title: `${loan.lenderName} EMI`,
      subtitle: isLate
        ? `Due ${dueDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · ${Math.abs(diffDays)} days late`
        : `Due ${dueDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`,
      amount: loan.emiAmount,
      tone: isLate ? "rose" as const : "amber" as const,
      sortValue: Math.abs(diffDays),
    };
  });
}

function buildSipUpcoming(data: PortfolioData, today: Date) {
  return data.investments.mutualFunds
    .filter((fund) => fund.sipDetails?.status === "Active")
    .map((fund) => {
      const sip = fund.sipDetails!;
      const startDate = new Date(`${sip.startDate}T00:00:00`);
      const dueDay = startDate.getDate();
      let nextDate = new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, getDaysInMonth(today)));
      if (nextDate < today) {
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(dueDay, getDaysInMonth(nextMonth)));
      }

      return {
        id: `sip-${fund.id}`,
        icon: "refresh" as const,
        title: `${fund.fundName} SIP`,
        subtitle: `Auto-debit ${nextDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`,
        amount: sip.monthlyAmount,
        tone: "sky" as const,
        sortValue: Math.ceil((nextDate.getTime() - today.getTime()) / 86400000),
      };
    });
}

function buildRecurringUpcoming(data: PortfolioData, today: Date) {
  return data.recurringRules
    .filter((rule) => rule.isActive)
    .map((rule) => {
      const nextDate = new Date(today.getFullYear(), today.getMonth(), Math.min(rule.dayOfMonth || today.getDate(), getDaysInMonth(today)));
      if (nextDate < today) nextDate.setMonth(nextDate.getMonth() + 1);

      return {
        id: `rule-${rule.id}`,
        icon: "zap" as const,
        title: rule.name,
        subtitle: `Due ${nextDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`,
        amount: rule.amount,
        tone: "amber" as const,
        sortValue: Math.ceil((nextDate.getTime() - today.getTime()) / 86400000),
      };
    });
}

export default function Dashboard({
  data,
  setActiveTab,
}: {
  data: PortfolioData;
  setActiveTab: (tab: string) => void;
}) {
  const today = useMemo(() => new Date(`${getTodayISO()}T00:00:00`), []);
  const [selectedSpendMonth, setSelectedSpendMonth] = useState(() => monthKey(new Date(`${getTodayISO()}T00:00:00`)));
  const accounts = useMemo(() => getAllAccounts(data), [data]);

  const bankBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const mutualFundsInvested = data.investments.mutualFunds.reduce((sum, fund) => sum + getMutualFundInvestedAmount(fund), 0);
  const mutualFundsCurrent = data.investments.mutualFunds.reduce((sum, fund) => sum + fund.currentValue, 0);
  const stockHoldings = getCombinedStockHoldings(data);
  const stocksInvested = stockHoldings.reduce((sum, item) => sum + item.totalInvested, 0);
  const stocksCurrent = stockHoldings.reduce((sum, item) => sum + item.totalCurrentValue, 0);
  const fdCurrent = data.investments.fd.reduce(
    (sum, fd) => sum + calculateFDValue(fd.principal, fd.interestRate, fd.startDate, fd.maturityDate),
    0,
  );
  const rdCurrent = data.investments.rd.reduce(
    (sum, rd) => sum + calculateRDValue(rd.monthlyDeposit, rd.interestRate, rd.startDate, rd.maturityDate),
    0,
  );
  const fdInvested = data.investments.fd.reduce((sum, fd) => sum + fd.principal, 0);
  const rdInvested = data.investments.rd.reduce((sum, rd) => sum + calculateRDInvested(rd.monthlyDeposit, rd.startDate, rd.maturityDate), 0);
  const totalLoans = data.loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0);
  const totalCurrent = mutualFundsCurrent + stocksCurrent + fdCurrent + rdCurrent;
  const totalInvested = mutualFundsInvested + stocksInvested + fdInvested + rdInvested;
  const netWorth = bankBalance + totalCurrent - totalLoans;
  const monthIncome = filterByMonth(data.income, today.getFullYear(), today.getMonth()).reduce((sum, item) => sum + item.amount, 0);
  const selectedSpendDate = parseMonthKey(selectedSpendMonth);
  const thisMonthExpenseEntries = filterByMonth(data.expenses, today.getFullYear(), today.getMonth());
  const monthExpenseEntries = filterByMonth(data.expenses, selectedSpendDate.getFullYear(), selectedSpendDate.getMonth());
  const monthExpense = monthExpenseEntries.reduce((sum, item) => sum + item.amount, 0);
  const currentMonthExpense = thisMonthExpenseEntries.reduce((sum, item) => sum + item.amount, 0);
  const budget = data.settings.monthlyBudget || Math.max(currentMonthExpense * 1.6, 1);
  const budgetPct = Math.max(0, Math.min(1, currentMonthExpense / budget));
  const daysInMonth = getDaysInMonth(today);
  const daysRemaining = Math.max(0, daysInMonth - today.getDate());
  const investmentSummaries = [
    { label: "Mutual funds", invested: mutualFundsInvested, current: mutualFundsCurrent },
    { label: "Stocks", invested: stocksInvested, current: stocksCurrent },
    { label: "FD", invested: fdInvested, current: fdCurrent },
    { label: "RD", invested: rdInvested, current: rdCurrent },
  ];
  const stockPortfolioSummaries = getStockPortfolioTotals(data);
  const spendMonthOptions = useMemo(() => {
    const keys = new Set<string>([monthKey(today)]);
    data.expenses.forEach((entry) => keys.add(entry.date.slice(0, 7)));
    return Array.from(keys)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({ key, label: parseMonthKey(key).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) }));
  }, [data.expenses, today]);

  const expenseBreakdown = useMemo(() => {
    const bucket = new Map<string, number>();
    monthExpenseEntries.forEach((entry) => {
      bucket.set(entry.category, (bucket.get(entry.category) || 0) + entry.amount);
    });

    const palette = [
      "oklch(.72 .14 295)",
      "oklch(.72 .14 130)",
      "oklch(.72 .14 35)",
      "oklch(.72 .14 340)",
      "oklch(.72 .14 75)",
      "oklch(.72 .14 155)",
      "oklch(.72 .14 235)",
      "oklch(.72 .14 260)",
    ];

    return Array.from(bucket.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount], index) => ({
        label,
        amount,
        color: palette[index % palette.length],
      }));
  }, [monthExpenseEntries]);

  const recentDailySpend = useMemo(() => {
    const result: number[] = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const iso = date.toISOString().slice(0, 10);
      const value = data.expenses
        .filter((entry) => entry.date === iso)
        .reduce((sum, entry) => sum + entry.amount, 0);
      result.push(value);
    }
    return result;
  }, [data.expenses, today]);

  const upcomingItems = useMemo(() => {
    return [...buildLoanUpcoming(data, today), ...buildSipUpcoming(data, today), ...buildRecurringUpcoming(data, today)]
      .sort((a, b) => a.sortValue - b.sortValue)
      .slice(0, 3);
  }, [data, today]);

  const totalComposition = Math.max(1, bankBalance + mutualFundsCurrent + stocksCurrent + fdCurrent + rdCurrent + Math.abs(totalLoans));
  const composition = [
    { label: "Bank", color: "var(--info)", value: bankBalance },
    { label: "MF+Stocks", color: "var(--violet)", value: mutualFundsCurrent + stocksCurrent },
    { label: "FDs", color: "var(--warn)", value: fdCurrent + rdCurrent },
    { label: "Loans", color: "var(--neg)", value: Math.abs(totalLoans), display: -totalLoans },
  ];

  const currentMonthLabel = selectedSpendDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const averageDailySpend = thisMonthExpenseEntries.length ? currentMonthExpense / Math.max(1, today.getDate()) : 0;

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0 lg:pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-[color:var(--ink-4)]">{formatDateLabel(today)}</div>
          <div className="font-display text-[20px] font-semibold">Hey, Ronit</div>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--bg-2)] hairline text-[color:var(--ink-2)]">
          <Icon name="search" size={18} />
        </button>
      </div>

      <Card className="relative overflow-hidden" padded={false}>
        <div
          className="absolute inset-0 opacity-70"
          style={{ background: "radial-gradient(120% 80% at 100% 0%, color-mix(in oklch, var(--accent) 25%, transparent) 0%, transparent 60%)" }}
        />
        <div className="relative p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-4)]">Net worth</div>
              <div className="mt-1 font-display text-[34px] font-semibold leading-none tabular">{formatINR(netWorth)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={netWorth >= totalInvested ? "emerald" : "rose"}>
                  <Icon name={netWorth >= totalInvested ? "trend-up" : "trend-down"} size={10} />
                  {netWorth >= totalInvested ? "+" : ""}{(((netWorth - totalInvested) / Math.max(totalInvested, 1)) * 100).toFixed(1)}% this mo
                </Chip>
                <span className="text-[11px] text-[color:var(--ink-4)]">•</span>
                <span className="text-[11.5px] text-[color:var(--ink-3)]">
                  Assets {formatINR(bankBalance + totalCurrent)} · Liabilities {formatINR(totalLoans)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5">
            {composition.map((item) => (
              <div
                key={item.label}
                className="h-full"
                style={{ width: `${(item.value / totalComposition) * 100}%`, background: item.color }}
              />
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px] sm:grid-cols-4">
            {composition.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                <span className="truncate text-[color:var(--ink-3)]">{item.label}</span>
                <span className="ml-auto font-mono-num text-[color:var(--ink-2)]">{formatINR(item.display ?? item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-2 text-[color:var(--pos)]">
            <div className="grid h-7 w-7 place-items-center rounded-[8px] bg-[color:var(--pos)]/12">
              <Icon name="arrow-down-right" size={14} />
            </div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]">Income</span>
          </div>
          <div className="mt-2 font-display text-[22px] font-semibold tabular">{formatINR(monthIncome)}</div>
          <div className="mt-1 text-[11px] text-[color:var(--ink-4)]">this month</div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-[color:var(--neg)]">
            <div className="grid h-7 w-7 place-items-center rounded-[8px] bg-[color:var(--neg)]/12">
              <Icon name="arrow-up-right" size={14} />
            </div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]">Spent</span>
          </div>
          <div className="mt-2 font-display text-[22px] font-semibold tabular">{formatINR(currentMonthExpense)}</div>
          <div className="mt-1 text-[11px] text-[color:var(--ink-4)]">of {formatINR(budget)} budget</div>
        </Card>
      </div>

      <div>
        <SectionHead
          title="Investments"
          action={
            <button onClick={() => setActiveTab("investments")} className="text-[11.5px] font-semibold text-[color:var(--accent)]">
              See all
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {investmentSummaries.map((item) => {
            const gainLoss = item.current - item.invested;
            const pct = item.invested > 0 ? (gainLoss / item.invested) * 100 : 0;
            return (
              <Card key={item.label} onClick={() => setActiveTab("investments")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-4)]">{item.label}</span>
                  <Chip tone={gainLoss >= 0 ? "emerald" : "rose"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</Chip>
                </div>
                <div className="mt-2 font-display text-[20px] font-semibold tabular">{formatINR(item.current)}</div>
                <div className="mt-1 text-[11px] text-[color:var(--ink-4)]">Invested {formatINR(item.invested)}</div>
              </Card>
            );
          })}
        </div>
        {stockPortfolioSummaries.length > 0 && (
          <div className="mt-3 space-y-2">
            {stockPortfolioSummaries.map(({ portfolio, totals }) => (
              <div key={portfolio.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-[color:var(--bg-2)] px-3 py-2 hairline">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold">{portfolio.name}</div>
                  <div className="text-[10.5px] text-[color:var(--ink-4)]">{portfolio.ownerName} / {portfolio.broker}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono-num text-[12.5px] font-semibold tabular">{formatINR(totals.current)}</div>
                  <div className="text-[10.5px] text-[color:var(--ink-4)]">Inv {formatINR(totals.invested)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-[15px] font-semibold">{today.toLocaleDateString("en-IN", { month: "long" })} budget</div>
            <div className="text-[11.5px] text-[color:var(--ink-3)]">
              {formatINR(Math.max(0, budget - currentMonthExpense))} left · {daysRemaining} days remaining
            </div>
          </div>
          <Ring value={budgetPct} size={54} stroke={7} color="var(--accent)">
            <div className="font-mono-num text-[12px] font-semibold tabular">{Math.round(budgetPct * 100)}%</div>
          </Ring>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full"
            style={{ width: `${budgetPct * 100}%`, background: "linear-gradient(90deg, var(--pos), var(--accent))" }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] tabular text-[color:var(--ink-4)]">
          <span>₹0</span>
          <span>Pace {formatINR(averageDailySpend * today.getDate())}</span>
          <span>{formatINR(budget)}</span>
        </div>
      </Card>

      <div>
        <SectionHead
          title="Accounts"
          action={
            <button onClick={() => setActiveTab("bank")} className="text-[11.5px] font-semibold text-[color:var(--accent)]">
              See all →
            </button>
          }
        />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
          {accounts.map((account, index) => (
            <Card key={account.id} className="min-w-[170px]" onClick={() => setActiveTab("bank")}>
              <div className="flex items-center justify-between">
                <BankBadge name={account.bankName} color={getAccountColor(index)} size={32} />
                <Chip tone="slate">{account.accountType}</Chip>
              </div>
              <div className="mt-2.5 font-display text-[17px] font-semibold tabular">{formatINR(account.balance)}</div>
              <div className="text-[11px] text-[color:var(--ink-3)]">{account.bankName}</div>
              <div className="mt-0.5 font-mono-num text-[10.5px] text-[color:var(--ink-4)]">{account.accountNumber || "Wallet"}</div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-display text-[15px] font-semibold">Spend by category</div>
            <div className="text-[11.5px] text-[color:var(--ink-3)]">{currentMonthLabel}</div>
          </div>
          <select
            value={selectedSpendMonth}
            onChange={(event) => setSelectedSpendMonth(event.target.value)}
            className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-[color:var(--ink-3)] outline-none hairline"
            aria-label="Spend month"
          >
            {spendMonthOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <Donut data={expenseBreakdown.slice(0, 6)} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {expenseBreakdown.slice(0, 5).map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="flex-1 truncate text-[12px] text-[color:var(--ink-2)]">{item.label}</span>
                <span className="font-mono-num text-[11.5px] tabular text-[color:var(--ink-3)]">{formatINR(item.amount)}</span>
              </div>
            ))}
            {expenseBreakdown.length === 0 && <div className="text-[12px] text-[color:var(--ink-4)]">No expenses recorded for this month.</div>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-display text-[15px] font-semibold">Last 14 days</div>
            <div className="text-[11.5px] text-[color:var(--ink-3)]">Daily spend</div>
          </div>
          <span className="text-[11px] font-mono-num tabular text-[color:var(--ink-3)]">
            avg {formatINR(recentDailySpend.reduce((sum, value) => sum + value, 0) / 14)}/day
          </span>
        </div>
        <Bars series={recentDailySpend} height={56} color="var(--neg)" />
      </Card>

      <div>
        <SectionHead title="Upcoming" action={<Chip tone="amber">{upcomingItems.length} due</Chip>} />
        <Card padded={false}>
          {upcomingItems.length === 0 && (
            <div className="px-4 py-5 text-[12px] text-[color:var(--ink-4)]">No upcoming items yet.</div>
          )}
          {upcomingItems.map((item, index) => {
            const toneColor = classForTone(item.tone);
            return (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-white/[0.05]" : ""}`}>
                <div
                  className="grid h-9 w-9 place-items-center rounded-[10px]"
                  style={{ background: `color-mix(in oklch, ${toneColor} 12%, transparent)`, color: toneColor }}
                >
                  <Icon name={item.icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{item.title}</div>
                  <div className="truncate text-[11.5px] text-[color:var(--ink-4)]">{item.subtitle}</div>
                </div>
                <div className="font-mono-num text-[13.5px] tabular">{formatINR(item.amount)}</div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
