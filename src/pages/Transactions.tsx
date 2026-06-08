import React, { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Sheet,
} from "../components/UI";
import { useMonthNavigator } from "../hooks/useMonthNavigator";
import { groupTransactionsByDate } from "../utils/groupByDate";
import {
  ExpenseCategory,
  ExpenseEntry,
  IncomeEntry,
  IncomeSource,
  PaymentMethod,
  PortfolioData,
  TransferEntry,
} from "../types";
import {
  deleteExpenseEntry,
  deleteIncomeEntry,
  deleteTransferEntry,
  filterByMonth,
  formatCurrency,
  getAllAccounts,
  getExpenseCategories,
  getExpenseMethods,
  getIncomeSources,
  getProjectedAccountBalance,
  isCashAccount,
  saveExpenseEntry,
  saveIncomeEntry,
  saveTransferEntry,
} from "../lib/utils";

type TxType = "income" | "expense" | "transfer";

type UnifiedTx = {
  id: string;
  date: string;
  amount: number;
  type: TxType;
  description: string;
  categoryLine: string;
  accountLine: string;
  method?: string;
  raw: IncomeEntry | ExpenseEntry | TransferEntry;
};

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

function formatMobileGroupDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const shortDate = value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
  const shortWeekday = value.toLocaleDateString("en-IN", { weekday: "short" });
  return `${shortDate} | ${shortWeekday}`;
}

function dayRelativeLabel(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const today = new Date();
  const base = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const diff = Math.round((base - value.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatMobileGroupDate(date);
}

function MiniBars({ series, color }: { series: number[]; color: string }) {
  const max = Math.max(...series, 1);
  return (
    <div className="mt-2 flex h-[22px] items-end gap-[3px]">
      {series.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(3, (value / max) * 22)}px`,
            background:
              value === 0
                ? "rgba(255,255,255,.06)"
                : `color-mix(in oklch, ${color} ${60 + (value / max) * 40}%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

function KindTabs({
  value,
  onChange,
  counts,
}: {
  value: "all" | TxType;
  onChange: (value: "all" | TxType) => void;
  counts: Record<"all" | TxType, number>;
}) {
  const options: Array<{
    id: "all" | TxType;
    label: string;
    icon?: React.ComponentProps<typeof Icon>["name"];
  }> = [
    { id: "all", label: "All" },
    { id: "expense", label: "Expense", icon: "arrow-up-right" },
    { id: "income", label: "Income", icon: "arrow-down-right" },
    { id: "transfer", label: "Transfer", icon: "swap" },
  ];

  return (
    <div className="inline-flex min-w-max rounded-full bg-[color:var(--bg-3)] p-1 hairline">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
              active
                ? "bg-[color:var(--accent)] text-[color:var(--bg)]"
                : "text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
            }`}
          >
            {option.icon && (
              <Icon name={option.icon} size={14} strokeWidth={2} />
            )}
            {option.label}
            <span
              className={`rounded-full px-1.5 py-[1px] text-[9.5px] font-mono-num ${active ? "bg-black/20" : "bg-white/[0.05]"}`}
            >
              {counts[option.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12px] transition ${
        active
          ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/40"
          : "bg-[color:var(--bg-3)] text-[color:var(--ink-2)] ring-1 ring-inset ring-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

export default function Transactions({
  data,
  updateData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const navigator = useMonthNavigator();
  const accounts = getAllAccounts(data);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | TxType>("all");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formType, setFormType] = useState<TxType>("expense");
  const [editingTx, setEditingTx] = useState<UnifiedTx | null>(null);
  const [quickAssignIncome, setQuickAssignIncome] =
    useState<IncomeEntry | null>(null);
  const [quickAssignExpense, setQuickAssignExpense] =
    useState<ExpenseEntry | null>(null);

  const monthIncome = filterByMonth(
    data.income,
    navigator.year,
    navigator.month,
  );
  const monthExpenses = filterByMonth(
    data.expenses,
    navigator.year,
    navigator.month,
  );
  const monthTransfers = filterByMonth(
    data.transfers,
    navigator.year,
    navigator.month,
  );

  useEffect(() => {
    if (sessionStorage.getItem("transactions_filter_mode") === "unassigned") {
      setShowOnlyUnassigned(true);
      sessionStorage.removeItem("transactions_filter_mode");
    }
  }, []);

  const unified = useMemo<UnifiedTx[]>(() => {
    const income = monthIncome.map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: entry.amount,
      type: "income" as const,
      description: entry.description || entry.source,
      categoryLine: entry.source,
      accountLine: entry.toAccountName || "Account?",
      method: "Credit",
      raw: entry,
    }));

    const expenses = monthExpenses.map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: entry.amount,
      type: "expense" as const,
      description: entry.description || entry.category,
      categoryLine: entry.category,
      accountLine: entry.fromAccountName || "Account?",
      method: entry.paymentMethod,
      raw: entry,
    }));

    const transfers = monthTransfers.map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: entry.amount,
      type: "transfer" as const,
      description: entry.description || "Transfer",
      categoryLine: "Transfer",
      accountLine: `${entry.fromAccountName} -> ${entry.toAccountName}`,
      method: "Transfer",
      raw: entry,
    }));

    return [...income, ...expenses, ...transfers].sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return b.amount - a.amount;
    });
  }, [monthExpenses, monthIncome, monthTransfers]);

  const filtered = useMemo(() => {
    return unified.filter((tx) => {
      if (showOnlyUnassigned) {
        if (tx.type === "income" && (tx.raw as IncomeEntry).toAccountId)
          return false;
        if (tx.type === "expense" && (tx.raw as ExpenseEntry).fromAccountId)
          return false;
        if (tx.type === "transfer") return false;
      }

      if (kind !== "all" && tx.type !== kind) return false;

      const queryText =
        `${tx.description} ${tx.categoryLine} ${tx.accountLine} ${tx.method || ""}`.toLowerCase();
      if (query && !queryText.includes(query.toLowerCase())) return false;

      if (accountFilter) {
        if (
          tx.type === "income" &&
          (tx.raw as IncomeEntry).toAccountId !== accountFilter
        )
          return false;
        if (
          tx.type === "expense" &&
          (tx.raw as ExpenseEntry).fromAccountId !== accountFilter
        )
          return false;
        if (tx.type === "transfer") {
          const transfer = tx.raw as TransferEntry;
          if (
            transfer.fromAccountId !== accountFilter &&
            transfer.toAccountId !== accountFilter
          )
            return false;
        }
      }

      if (methodFilter) {
        if (tx.type !== "expense") return false;
        if ((tx.raw as ExpenseEntry).paymentMethod !== methodFilter)
          return false;
      }

      return true;
    });
  }, [accountFilter, kind, methodFilter, query, showOnlyUnassigned, unified]);

  const grouped = groupTransactionsByDate(filtered, "mixed");

  const counts = useMemo(
    () => ({
      all: unified.length,
      income: unified.filter((tx) => tx.type === "income").length,
      expense: unified.filter((tx) => tx.type === "expense").length,
      transfer: unified.filter((tx) => tx.type === "transfer").length,
    }),
    [unified],
  );

  const incomeTotal = filtered
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const expenseTotal = filtered
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const incomeSeries = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(navigator.year, navigator.month, index + 1)
      .toISOString()
      .slice(0, 10);
    return filtered
      .filter((tx) => tx.date === date && tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
  });

  const expenseSeries = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(navigator.year, navigator.month, index + 1)
      .toISOString()
      .slice(0, 10);
    return filtered
      .filter((tx) => tx.date === date && tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);
  });

  const resetFilters = () => {
    setKind("all");
    setAccountFilter(null);
    setMethodFilter(null);
    setShowOnlyUnassigned(false);
    setQuery("");
  };

  const openEdit = (tx: UnifiedTx) => {
    setFormType(tx.type);
    setEditingTx(tx);
    setIsModalOpen(true);
  };

  const saveIncome = (entry: IncomeEntry) =>
    updateData(
      saveIncomeEntry(data, entry, editingTx?.raw as IncomeEntry | undefined),
    );
  const saveExpense = (entry: ExpenseEntry) =>
    updateData(
      saveExpenseEntry(data, entry, editingTx?.raw as ExpenseEntry | undefined),
    );
  const saveTransfer = (entry: TransferEntry) =>
    updateData(
      saveTransferEntry(
        data,
        entry,
        editingTx?.raw as TransferEntry | undefined,
      ),
    );

  const deleteTx = (tx: UnifiedTx) => {
    if (tx.type === "income")
      updateData(deleteIncomeEntry(data, tx.raw as IncomeEntry));
    if (tx.type === "expense")
      updateData(deleteExpenseEntry(data, tx.raw as ExpenseEntry));
    if (tx.type === "transfer")
      updateData(deleteTransferEntry(data, tx.raw as TransferEntry));
  };

  return (
    <div className="space-y-3 px-4 pt-4 pb-8 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[20px] font-semibold">
            Transactions
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-[color:var(--ink-4)]">
            <span>
              {filtered.length} entries | {navigator.label}
            </span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={navigator.goToPrev}
                className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--bg-3)] text-[color:var(--ink-3)] ring-1 ring-inset ring-white/[0.06] hover:text-[color:var(--ink)]"
              >
                <Icon name="chev-left" size={12} />
              </button>
              <button
                type="button"
                onClick={navigator.goToNext}
                disabled={navigator.isCurrentMonth}
                className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--bg-3)] text-[color:var(--ink-3)] ring-1 ring-inset ring-white/[0.06] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon name="chev-right" size={12} />
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingTx(null);
            setFormType("expense");
            setIsModalOpen(true);
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] shadow-[0_6px_18px_-6px_color-mix(in_oklch,var(--accent)_60%,transparent)]"
        >
          <Icon name="plus" size={18} strokeWidth={2.4} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-4)]">
            In
          </div>
          <div className="mt-1 font-display text-[18px] font-semibold tabular text-[color:var(--pos)]">
            +{compactINR(incomeTotal)}
          </div>
          <MiniBars series={incomeSeries} color="var(--pos)" />
        </Card>
        <Card>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-4)]">
            Out
          </div>
          <div className="mt-1 font-display text-[18px] font-semibold tabular text-[color:var(--neg)]">
            -{compactINR(expenseTotal)}
          </div>
          <MiniBars series={expenseSeries} color="var(--neg)" />
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-[14px] bg-[color:var(--bg-3)] px-3.5 py-[11px] ring-1 ring-inset ring-white/[0.06]">
          <Icon name="search" size={16} className="text-[color:var(--ink-4)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search description, category..."
            className="flex-1 bg-transparent text-[14px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-4)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] ring-1 ring-inset transition ${
            accountFilter || methodFilter || showOnlyUnassigned
              ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)] ring-[color:var(--accent)]/40"
              : "bg-[color:var(--bg-3)] text-[color:var(--ink-2)] ring-white/[0.06]"
          }`}
        >
          <Icon name="filter" size={18} />
          {(accountFilter || methodFilter || showOnlyUnassigned) && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
          )}
        </button>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
        <KindTabs value={kind} onChange={setKind} counts={counts} />
      </div>

      {(accountFilter || methodFilter || showOnlyUnassigned) && (
        <div className="flex flex-wrap gap-1.5">
          {showOnlyUnassigned && (
            <button
              type="button"
              onClick={() => setShowOnlyUnassigned(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent)]/10 px-2.5 py-1 text-[11px] text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/25"
            >
              Needs account <Icon name="close" size={11} />
            </button>
          )}
          {accountFilter && (
            <button
              type="button"
              onClick={() => setAccountFilter(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent)]/10 px-2.5 py-1 text-[11px] text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/25"
            >
              {accounts.find((account) => account.id === accountFilter)
                ?.bankName || "Account"}{" "}
              <Icon name="close" size={11} />
            </button>
          )}
          {methodFilter && (
            <button
              type="button"
              onClick={() => setMethodFilter(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent)]/10 px-2.5 py-1 text-[11px] text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/25"
            >
              {methodFilter} <Icon name="close" size={11} />
            </button>
          )}
        </div>
      )}

      {grouped.length === 0 ? (
        <Card className="py-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.05] text-[color:var(--ink-4)]">
            <Icon name="inbox" size={22} />
          </div>
          <div className="mt-3 font-display text-[15px] font-semibold">
            No matches
          </div>
          <div className="text-[12px] text-[color:var(--ink-4)]">
            Try clearing filters or changing search.
          </div>
        </Card>
      ) : (
        grouped.map((group) => {
          const dayRows = group.items as UnifiedTx[];
          const dayTotal = dayRows.reduce(
            (sum, tx) =>
              sum +
              (tx.type === "income"
                ? tx.amount
                : tx.type === "expense"
                  ? -tx.amount
                  : 0),
            0,
          );

          return (
            <div key={group.date}>
              <div className="flex items-center justify-between px-1 pt-2 pb-1.5">
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
                  {dayRelativeLabel(group.date)}
                </div>
                <div
                  className={`font-mono-num text-[11.5px] tabular ${dayTotal >= 0 ? "text-[color:var(--pos)]" : "text-[color:var(--ink-3)]"}`}
                >
                  {dayTotal >= 0 ? "+" : "-"}
                  {compactINR(Math.abs(dayTotal))}
                </div>
              </div>

              <Card padded={false}>
                {dayRows.map((tx, index) => {
                  const toneColor =
                    tx.type === "income"
                      ? "var(--pos)"
                      : tx.type === "expense"
                        ? "var(--neg)"
                        : "var(--info)";
                  const isAutoGenerated =
                    tx.type === "expense" &&
                    (tx.raw as ExpenseEntry).isAutoGenerated;
                  const isInvestmentAuto =
                    isAutoGenerated &&
                    typeof (tx.raw as ExpenseEntry).autoSourceId === "string" &&
                    ((
                      (tx.raw as ExpenseEntry).autoSourceId as string
                    ).startsWith("sip:") ||
                      (
                        (tx.raw as ExpenseEntry).autoSourceId as string
                      ).startsWith("rd:"));
                  const hasMissingAccount =
                    (tx.type === "income" &&
                      !(tx.raw as IncomeEntry).toAccountId) ||
                    (tx.type === "expense" &&
                      !(tx.raw as ExpenseEntry).fromAccountId &&
                      !isAutoGenerated);

                  return (
                    <div
                      key={`${tx.type}-${tx.id}`}
                      className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-white/[0.05]" : ""}`}
                    >
                      <div
                        className="grid h-[38px] w-[38px] place-items-center rounded-[12px]"
                        style={{
                          background: `color-mix(in oklch, ${toneColor} 18%, transparent)`,
                          color: toneColor,
                        }}
                      >
                        <Icon
                          name={
                            tx.type === "income"
                              ? "arrow-down-right"
                              : tx.type === "expense"
                                ? "arrow-up-right"
                                : "swap"
                          }
                          size={16}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="truncate text-[13.5px] font-semibold text-[color:var(--ink)]">
                            {tx.description}
                          </div>
                          {isAutoGenerated && (
                            <Badge variant="info">Auto</Badge>
                          )}
                          {hasMissingAccount && (
                            <button
                              type="button"
                              onClick={() => {
                                if (tx.type === "income")
                                  setQuickAssignIncome(tx.raw as IncomeEntry);
                                if (tx.type === "expense")
                                  setQuickAssignExpense(tx.raw as ExpenseEntry);
                              }}
                            >
                              <Badge variant="warning">Account?</Badge>
                            </button>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-4)]">
                          <span className="truncate">{tx.accountLine}</span>
                          {tx.method && (
                            <>
                              <span>|</span>
                              <span>{tx.method}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="font-mono-num text-[14px] font-semibold tabular"
                          style={{ color: toneColor }}
                        >
                          {tx.type === "income"
                            ? "+"
                            : tx.type === "expense"
                              ? "-"
                              : ""}
                          {compactINR(tx.amount)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">
                          {tx.categoryLine}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {(!isAutoGenerated || isInvestmentAuto) && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(tx)}
                              className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--ink)]"
                            >
                              <Icon name="pencil" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTx(tx)}
                              className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        subtitle="Refine your list"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={resetFilters}>
              Reset
            </Button>
            <Button block onClick={() => setFiltersOpen(false)}>
              Apply
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
              Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={showOnlyUnassigned}
                onClick={() => setShowOnlyUnassigned((value) => !value)}
              >
                Needs account
              </FilterPill>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
              Account
            </div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((account) => (
                <FilterPill
                  key={account.id}
                  active={accountFilter === account.id}
                  onClick={() =>
                    setAccountFilter(
                      accountFilter === account.id ? null : account.id,
                    )
                  }
                >
                  {account.bankName}
                </FilterPill>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
              Payment method
            </div>
            <div className="flex flex-wrap gap-1.5">
              {getExpenseMethods().map((method) => (
                <FilterPill
                  key={method}
                  active={methodFilter === method}
                  onClick={() =>
                    setMethodFilter(methodFilter === method ? null : method)
                  }
                >
                  {method}
                </FilterPill>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTx(null);
        }}
        formType={formType}
        setFormType={setFormType}
        data={data}
        editingTx={editingTx}
        onSaveIncome={saveIncome}
        onSaveExpense={saveExpense}
        onSaveTransfer={saveTransfer}
      />
      <QuickAssignIncomeModal
        data={data}
        entry={quickAssignIncome}
        onClose={() => setQuickAssignIncome(null)}
        updateData={updateData}
      />
      <QuickAssignExpenseModal
        data={data}
        entry={quickAssignExpense}
        onClose={() => setQuickAssignExpense(null)}
        updateData={updateData}
      />
    </div>
  );
}

function TransactionModal({
  isOpen,
  onClose,
  formType,
  setFormType,
  data,
  editingTx,
  onSaveIncome,
  onSaveExpense,
  onSaveTransfer,
}: {
  isOpen: boolean;
  onClose: () => void;
  formType: TxType;
  setFormType: (type: TxType) => void;
  data: PortfolioData;
  editingTx: UnifiedTx | null;
  onSaveIncome: (entry: IncomeEntry) => void;
  onSaveExpense: (entry: ExpenseEntry) => void;
  onSaveTransfer: (entry: TransferEntry) => void;
}) {
  const accounts = getAllAccounts(data);
  const defaultAccount = accounts[0]?.id || "acc_cash";
  const isEditing = Boolean(editingTx);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Transaction" : "Add Transaction"}
      mobileSheet
      className="max-w-[560px]"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["income", "expense", "transfer"] as TxType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFormType(type)}
              className={`flex-1 rounded-[12px] px-3 py-2 text-sm font-semibold ${formType === type ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "bg-[color:var(--bg-3)] text-[color:var(--ink-3)] hairline"}`}
            >
              {type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {formType === "income" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const toAccountId = String(formData.get("toAccountId"));
              onSaveIncome({
                id:
                  (editingTx?.raw as IncomeEntry | undefined)?.id ||
                  Date.now().toString(),
                date: String(formData.get("date")),
                source: formData.get("source") as IncomeSource,
                amount: Number(formData.get("amount")),
                description:
                  String(formData.get("description") || "") || undefined,
                toAccountId,
                toAccountName:
                  accounts.find((account) => account.id === toAccountId)
                    ?.bankName || null,
              });
              onClose();
            }}
            className="space-y-4"
          >
            <Input
              label="Amount"
              name="amount"
              type="number"
              required
              defaultValue={(editingTx?.raw as IncomeEntry | undefined)?.amount}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date"
                name="date"
                type="date"
                required
                defaultValue={
                  (editingTx?.raw as IncomeEntry | undefined)?.date ||
                  new Date().toISOString().slice(0, 10)
                }
              />
              <Select
                label="Source"
                name="source"
                defaultValue={
                  (editingTx?.raw as IncomeEntry | undefined)?.source ||
                  "Salary"
                }
              >
                {getIncomeSources(data).map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              label="Received In"
              name="toAccountId"
              defaultValue={
                (editingTx?.raw as IncomeEntry | undefined)?.toAccountId ||
                defaultAccount
              }
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName}
                </option>
              ))}
            </Select>
            <Input
              label="Description / Note"
              name="description"
              defaultValue={
                (editingTx?.raw as IncomeEntry | undefined)?.description
              }
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" block>
                {isEditing ? "Update" : "Add"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {formType === "expense" && (
          <ExpenseForm
            data={data}
            editing={editingTx?.raw as ExpenseEntry | undefined}
            onSave={onSaveExpense}
            onClose={onClose}
          />
        )}
        {formType === "transfer" && (
          <TransferForm
            data={data}
            editing={editingTx?.raw as TransferEntry | undefined}
            onSave={onSaveTransfer}
            onClose={onClose}
          />
        )}
      </div>
    </Modal>
  );
}

function ExpenseForm({
  data,
  editing,
  onSave,
  onClose,
}: {
  data: PortfolioData;
  editing?: ExpenseEntry;
  onSave: (entry: ExpenseEntry) => void;
  onClose: () => void;
}) {
  const accounts = getAllAccounts(data);
  const [fromAccountId, setFromAccountId] = useState(
    editing?.fromAccountId || accounts[0]?.id || "acc_cash",
  );
  const cash = isCashAccount(fromAccountId);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const amount = Number(formData.get("amount"));
        const projected = getProjectedAccountBalance(
          accounts,
          fromAccountId,
          -amount +
            (editing?.fromAccountId === fromAccountId ? editing.amount : 0),
        );
        if (
          projected < 0 &&
          !confirm(
            `This expense will make your ${accounts.find((account) => account.id === fromAccountId)?.bankName} balance negative. Continue?`,
          )
        )
          return;
        onSave({
          id: editing?.id || Date.now().toString(),
          date: String(formData.get("date")),
          category: formData.get("category") as ExpenseCategory,
          amount,
          fromAccountId,
          fromAccountName:
            accounts.find((account) => account.id === fromAccountId)
              ?.bankName || null,
          paymentMethod: (cash
            ? "Cash"
            : formData.get("paymentMethod")) as PaymentMethod,
          description: String(formData.get("description") || "") || undefined,
          isAutoGenerated: editing?.isAutoGenerated,
          autoSourceId: editing?.autoSourceId,
          recurringRuleId: editing?.recurringRuleId,
        });
        onClose();
      }}
      className="space-y-4"
    >
      <Input
        label="Amount"
        name="amount"
        type="number"
        required
        defaultValue={editing?.amount}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date"
          name="date"
          type="date"
          required
          defaultValue={editing?.date || new Date().toISOString().slice(0, 10)}
        />
        <Select
          label="Category"
          name="category"
          defaultValue={editing?.category || "Food"}
        >
          {getExpenseCategories(data).map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
      </div>
      <Select
        label="Paid From"
        name="fromAccountId"
        value={fromAccountId}
        onChange={(event) => setFromAccountId(event.target.value)}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.bankName}
          </option>
        ))}
      </Select>
      {!cash && (
        <Select
          label="Payment Method"
          name="paymentMethod"
          defaultValue={editing?.paymentMethod || "UPI"}
        >
          {getExpenseMethods()
            .filter((method) => method !== "Cash")
            .map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
        </Select>
      )}
      <Input
        label="Description / Note"
        name="description"
        defaultValue={editing?.description}
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" block>
          {editing ? "Update" : "Add"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TransferForm({
  data,
  editing,
  onSave,
  onClose,
}: {
  data: PortfolioData;
  editing?: TransferEntry;
  onSave: (entry: TransferEntry) => void;
  onClose: () => void;
}) {
  const accounts = getAllAccounts(data);
  const [fromAccountId, setFromAccountId] = useState(
    editing?.fromAccountId || accounts[0]?.id || "acc_cash",
  );
  const [toAccountId, setToAccountId] = useState(
    editing?.toAccountId || accounts[1]?.id || accounts[0]?.id || "acc_cash",
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (fromAccountId === toAccountId) {
          alert("From Account and To Account cannot be the same.");
          return;
        }
        const formData = new FormData(event.currentTarget);
        const amount = Number(formData.get("amount"));
        const fees = Number(formData.get("fees") || 0);
        const projected = getProjectedAccountBalance(
          accounts,
          fromAccountId,
          -(amount + fees) +
            (editing?.fromAccountId === fromAccountId
              ? editing.amount + editing.fees
              : 0),
        );
        if (
          projected < 0 &&
          !confirm(
            `This transfer will make your ${accounts.find((account) => account.id === fromAccountId)?.bankName} balance negative. Continue?`,
          )
        )
          return;
        onSave({
          id: editing?.id || `txfr_${Date.now()}`,
          date: String(formData.get("date")),
          amount,
          fromAccountId,
          fromAccountName:
            accounts.find((account) => account.id === fromAccountId)
              ?.bankName || "",
          toAccountId,
          toAccountName:
            accounts.find((account) => account.id === toAccountId)?.bankName ||
            "",
          description: String(formData.get("description") || "") || undefined,
          fees,
        });
        onClose();
      }}
      className="space-y-4"
    >
      <Input
        label="Amount"
        name="amount"
        type="number"
        required
        defaultValue={editing?.amount}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date"
          name="date"
          type="date"
          required
          defaultValue={editing?.date || new Date().toISOString().slice(0, 10)}
        />
        <Select
          label="From Account"
          value={fromAccountId}
          onChange={(event) => setFromAccountId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.bankName}
            </option>
          ))}
        </Select>
      </div>
      <Select
        label="To Account"
        value={toAccountId}
        onChange={(event) => setToAccountId(event.target.value)}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.bankName}
          </option>
        ))}
      </Select>
      <Input
        label="Transfer Fees"
        name="fees"
        type="number"
        defaultValue={editing?.fees || 0}
      />
      <Input
        label="Description / Note"
        name="description"
        defaultValue={editing?.description}
      />
      <div className="flex gap-3 pt-2">
        <Button type="submit" block>
          {editing ? "Update" : "Add"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QuickAssignIncomeModal({
  data,
  entry,
  onClose,
  updateData,
}: {
  data: PortfolioData;
  entry: IncomeEntry | null;
  onClose: () => void;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const accounts = getAllAccounts(data);
  if (!entry) return null;

  return (
    <Modal isOpen={!!entry} onClose={onClose} title="Assign Account">
      <div className="space-y-4">
        <div className="rounded-[16px] bg-[color:var(--bg-3)] px-4 py-3 text-sm text-[color:var(--ink-2)] hairline">
          {entry.description || entry.source} - {formatCurrency(entry.amount)}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => {
                updateData(
                  saveIncomeEntry(
                    data,
                    {
                      ...entry,
                      toAccountId: account.id,
                      toAccountName: account.bankName,
                    },
                    entry,
                  ),
                );
                onClose();
              }}
              className="rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-left text-[color:var(--ink-2)] hairline hover:bg-white/[0.04]"
            >
              {account.bankName}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function QuickAssignExpenseModal({
  data,
  entry,
  onClose,
  updateData,
}: {
  data: PortfolioData;
  entry: ExpenseEntry | null;
  onClose: () => void;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const accounts = getAllAccounts(data);
  if (!entry) return null;

  return (
    <Modal isOpen={!!entry} onClose={onClose} title="Assign Account">
      <div className="space-y-4">
        <div className="rounded-[16px] bg-[color:var(--bg-3)] px-4 py-3 text-sm text-[color:var(--ink-2)] hairline">
          {entry.description || entry.category} - {formatCurrency(entry.amount)}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => {
                updateData(
                  saveExpenseEntry(
                    data,
                    {
                      ...entry,
                      fromAccountId: account.id,
                      fromAccountName: account.bankName,
                      paymentMethod: account.isCash
                        ? "Cash"
                        : entry.paymentMethod || "UPI",
                    },
                    entry,
                  ),
                );
                onClose();
              }}
              className="rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-left text-[color:var(--ink-2)] hairline hover:bg-white/[0.04]"
            >
              {account.bankName}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
