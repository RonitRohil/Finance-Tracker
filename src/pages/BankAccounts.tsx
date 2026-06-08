import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Sheet,
  Select,
} from "../components/UI";
import {
  AccountType,
  BankAccount,
  ExpenseCategory,
  IncomeSource,
  PaymentMethod,
  PortfolioData,
} from "../types";
import {
  formatCurrency,
  getAccountMonthlyStats,
  getAllAccounts,
  getExpenseCategories,
  getExpenseMethods,
  getIncomeSources,
  getRecentAccountTransactions,
  saveExpenseEntry,
  saveIncomeEntry,
  saveTransferEntry,
} from "../lib/utils";

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

function accountColor(index: number) {
  const colors = [
    "oklch(.70 .14 235)",
    "oklch(.70 .14 35)",
    "oklch(.70 .14 295)",
    "oklch(.70 .14 90)",
  ];
  return colors[index % colors.length];
}

function accountShort(name: string) {
  if (/cash/i.test(name)) return "Rs";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

function BankBadge({
  name,
  color,
  size = 44,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="grid place-items-center rounded-[12px] font-display text-[13px] font-semibold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklch, ${color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 40%, transparent)`,
        color,
      }}
    >
      {accountShort(name)}
    </div>
  );
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(3, (value / max) * 24)}px`,
            background: `color-mix(in oklch, ${color} ${50 + (value / max) * 40}%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

export default function BankAccounts({
  data,
  updateData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(
    null,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<{
    kind: "income" | "expense" | "transfer";
    accountId: string;
  } | null>(null);
  const accounts = useMemo(() => getAllAccounts(data), [data]);
  const current = new Date();
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const openAccount = accounts.find((account) => account.id === openId) || null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newBalance = Number(formData.get("balance"));
    // Cash account: allow direct balance update
    if (editingAccount?.isCash) {
      const account: BankAccount = {
        id: editingAccount.id,
        bankName: editingAccount.bankName,
        accountType: editingAccount.accountType,
        accountNumber: editingAccount.accountNumber,
        balance: newBalance,
        notes: editingAccount.notes,
        isCash: true,
      };
      updateData({
        bankAccounts: accounts.map((item) =>
          item.id === editingAccount.id ? account : item,
        ),
      });
      setIsModalOpen(false);
      setEditingAccount(null);
      return;
    }

    const accountMeta: BankAccount = {
      id: editingAccount?.id || `acc_${Date.now()}`,
      bankName: String(formData.get("bankName")),
      accountType: formData.get("accountType") as AccountType,
      accountNumber: String(formData.get("accountNumber") || ""),
      balance: editingAccount?.balance ?? Number(formData.get("balance")),
      notes: String(formData.get("notes") || "") || undefined,
      isCash: editingAccount?.isCash,
    };

    // If editing an existing account and balance changed, record the difference as a transaction
    if (editingAccount) {
      const oldBalance = editingAccount.balance;
      const diff = newBalance - oldBalance;
      const baseData = {
        ...data,
        bankAccounts: accounts.map((acc) =>
          acc.id === editingAccount.id
            ? {
                ...acc,
                bankName: accountMeta.bankName,
                accountNumber: accountMeta.accountNumber,
                accountType: accountMeta.accountType,
                notes: accountMeta.notes,
              }
            : acc,
        ),
      };

      if (diff !== 0) {
        const today = new Date().toISOString().slice(0, 10);
        if (diff > 0) {
          const incomeEntry = {
            id: crypto.randomUUID(),
            date: today,
            amount: diff,
            source: "Other" as IncomeSource,
            toAccountId: editingAccount.id,
            toAccountName: accountMeta.bankName,
            description: "Balance correction",
          };
          let updated = saveIncomeEntry(baseData, incomeEntry as any);
          // ensure account metadata updated
          updated = {
            ...updated,
            bankAccounts: updated.bankAccounts.map((acc) =>
              acc.id === editingAccount.id
                ? {
                    ...acc,
                    bankName: accountMeta.bankName,
                    accountNumber: accountMeta.accountNumber,
                    accountType: accountMeta.accountType,
                    notes: accountMeta.notes,
                  }
                : acc,
            ),
          } as any;
          updateData(updated as Partial<PortfolioData>);
          setIsModalOpen(false);
          setEditingAccount(null);
          return;
        }

        if (diff < 0) {
          const expenseEntry = {
            id: crypto.randomUUID(),
            date: new Date().toISOString().slice(0, 10),
            amount: Math.abs(diff),
            category: "Other" as ExpenseCategory,
            fromAccountId: editingAccount.id,
            fromAccountName: accountMeta.bankName,
            paymentMethod: "Net Banking" as PaymentMethod,
            description: "Balance correction",
          };
          let updated = saveExpenseEntry(baseData, expenseEntry as any);
          updated = {
            ...updated,
            bankAccounts: updated.bankAccounts.map((acc) =>
              acc.id === editingAccount.id
                ? {
                    ...acc,
                    bankName: accountMeta.bankName,
                    accountNumber: accountMeta.accountNumber,
                    accountType: accountMeta.accountType,
                    notes: accountMeta.notes,
                  }
                : acc,
            ),
          } as any;
          updateData(updated as Partial<PortfolioData>);
          setIsModalOpen(false);
          setEditingAccount(null);
          return;
        }
      }

      // No balance change, just update metadata
      updateData({
        bankAccounts: accounts.map((item) =>
          item.id === editingAccount.id
            ? {
                ...item,
                bankName: accountMeta.bankName,
                accountNumber: accountMeta.accountNumber,
                accountType: accountMeta.accountType,
                notes: accountMeta.notes,
                balance: item.balance,
              }
            : item,
        ),
      });
      setIsModalOpen(false);
      setEditingAccount(null);
      return;
    }

    // Creating new account
    const newAccount: BankAccount = {
      ...accountMeta,
      balance: Number(formData.get("balance")) || 0,
    };
    updateData({ bankAccounts: [...accounts, newAccount] });
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[20px] font-semibold">Accounts</div>
          <div className="text-[11.5px] text-[color:var(--ink-4)]">
            {accounts.length} accounts · Synced locally
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setIsModalOpen(true)}
          icon={<Icon name="plus" size={14} />}
        >
          Add
        </Button>
      </div>

      <Card className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, color-mix(in oklch, var(--info) 20%, transparent), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-4)]">
            Total balance
          </div>
          <div className="mt-1 font-display text-[30px] font-semibold tabular">
            {formatCurrency(total)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="info">Liquid</Badge>
            <span className="text-[11.5px] text-[color:var(--ink-3)]">
              Across {accounts.length} accounts
            </span>
          </div>
        </div>
      </Card>

      <div className="space-y-2.5">
        {accounts.map((account, index) => {
          const color = accountColor(index);
          const stats = getAccountMonthlyStats(
            data,
            account.id,
            current.getFullYear(),
            current.getMonth(),
          );
          return (
            <Card
              key={account.id}
              padded={false}
              onClick={() => setOpenId(account.id)}
            >
              <div className="flex items-center gap-3 p-4">
                <BankBadge name={account.bankName} color={color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[14.5px] font-semibold">
                      {account.bankName}
                    </div>
                    <Badge variant="secondary">{account.accountType}</Badge>
                  </div>
                  <div className="mt-0.5 font-mono-num text-[11.5px] text-[color:var(--ink-4)]">
                    {account.accountNumber || "Wallet"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-[17px] font-semibold tabular">
                    {formatCurrency(account.balance)}
                  </div>
                  <div className="text-[10.5px] text-[color:var(--ink-4)]">
                    Available
                  </div>
                </div>
              </div>
              <div className="px-4 pb-3">
                <MiniBars
                  values={[
                    stats.incomeTotal,
                    stats.expenseTotal,
                    Math.max(1, account.balance / 10),
                    stats.transfersTotal || 1,
                    stats.incomeTotal / 2 || 1,
                    stats.expenseTotal / 2 || 1,
                  ]}
                  color={color}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet
        open={!!openAccount}
        onClose={() => setOpenId(null)}
        title={openAccount?.bankName || ""}
        subtitle="Quick actions"
      >
        {openAccount && (
          <>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {[
                {
                  id: "inc",
                  icon: "arrow-down-right",
                  label: "Income",
                  tone: "var(--pos)",
                },
                {
                  id: "exp",
                  icon: "arrow-up-right",
                  label: "Expense",
                  tone: "var(--neg)",
                },
                {
                  id: "xfer",
                  icon: "swap",
                  label: "Transfer",
                  tone: "var(--info)",
                },
                {
                  id: "stmt",
                  icon: "download",
                  label: "Statement",
                  tone: "var(--violet)",
                },
              ].map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    if (action.id === "stmt") {
                      exportAccountStatement(openAccount, data);
                      return;
                    }
                    setOpenId(null);
                    setQuickAction({
                      kind:
                        action.id === "inc"
                          ? "income"
                          : action.id === "exp"
                            ? "expense"
                            : "transfer",
                      accountId: openAccount.id,
                    });
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-[14px] bg-[color:var(--bg-3)] py-3 hairline transition hover:bg-white/[0.04] active:scale-[0.98]"
                >
                  <div
                    className="grid h-8 w-8 place-items-center rounded-[10px]"
                    style={{
                      background: `color-mix(in oklch, ${action.tone} 18%, transparent)`,
                      color: action.tone,
                    }}
                  >
                    <Icon name={action.icon as any} size={16} />
                  </div>
                  <span className="text-[10.5px] font-semibold text-[color:var(--ink-2)]">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Card className="bg-[color:var(--bg-3)]" padded>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">
                  Balance
                </div>
                <div className="mt-1 font-mono-num text-[13px] font-semibold">
                  {compactINR(openAccount.balance)}
                </div>
              </Card>
              <Card className="bg-[color:var(--bg-3)]" padded>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">
                  In
                </div>
                <div className="mt-1 font-mono-num text-[13px] font-semibold text-[color:var(--pos)]">
                  {compactINR(
                    getAccountMonthlyStats(
                      data,
                      openAccount.id,
                      current.getFullYear(),
                      current.getMonth(),
                    ).incomeTotal,
                  )}
                </div>
              </Card>
              <Card className="bg-[color:var(--bg-3)]" padded>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">
                  Out
                </div>
                <div className="mt-1 font-mono-num text-[13px] font-semibold text-[color:var(--neg)]">
                  {compactINR(
                    getAccountMonthlyStats(
                      data,
                      openAccount.id,
                      current.getFullYear(),
                      current.getMonth(),
                    ).expenseTotal,
                  )}
                </div>
              </Card>
            </div>

            <div className="mb-1 mt-4 px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
              Recent
            </div>
            <div className="overflow-hidden rounded-[14px] bg-[color:var(--bg-3)] hairline">
              {getRecentAccountTransactions(data, openAccount.id).length ===
                0 && (
                <div className="px-4 py-4 text-[12px] text-[color:var(--ink-4)]">
                  No transactions yet.
                </div>
              )}
              {getRecentAccountTransactions(data, openAccount.id).map(
                (tx, index) => (
                  <div
                    key={`${tx.kind}-${tx.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2.5 ${index > 0 ? "border-t border-white/[0.05]" : ""}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background:
                          tx.kind === "income"
                            ? "var(--pos)"
                            : tx.kind === "transfer"
                              ? "var(--info)"
                              : "var(--neg)",
                      }}
                    />
                    <div className="flex-1 truncate text-[12.5px] text-[color:var(--ink)]">
                      {tx.description ||
                        ("source" in tx
                          ? tx.source
                          : "category" in tx
                            ? tx.category
                            : "Transfer")}
                    </div>
                    <div className="font-mono-num text-[12.5px] tabular text-[color:var(--ink-2)]">
                      {compactINR(tx.amount)}
                    </div>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </Sheet>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAccount(null);
        }}
        title={editingAccount ? "Edit Account" : "Add Account"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Account Name"
            name="bankName"
            required
            defaultValue={editingAccount?.bankName}
            disabled={!!editingAccount?.isCash}
          />
          <Select
            label="Account Type"
            name="accountType"
            defaultValue={editingAccount?.accountType || "Savings"}
            disabled={!!editingAccount?.isCash}
          >
            {["Savings", "Current", "Salary"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Input
            label="Account Number (Last 4 digits)"
            name="accountNumber"
            maxLength={4}
            defaultValue={editingAccount?.accountNumber}
            disabled={!!editingAccount?.isCash}
          />
          <Input
            label="Current Balance"
            name="balance"
            type="number"
            required
            defaultValue={editingAccount?.balance}
          />
          {!editingAccount?.isCash && (
            <Input
              label="Notes"
              name="notes"
              defaultValue={editingAccount?.notes}
            />
          )}
          {editingAccount?.isCash && (
            <div className="rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-sm text-[color:var(--warn)] hairline">
              Cash is a protected account. You can update its balance here, but
              it cannot be deleted or renamed.
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" block>
              {editingAccount ? "Update Account" : "Add Account"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setEditingAccount(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <AccountQuickActionModal
        action={quickAction}
        data={data}
        updateData={updateData}
        onClose={() => setQuickAction(null)}
      />
    </div>
  );
}

function exportAccountStatement(account: BankAccount, data: PortfolioData) {
  const statementRows = [
    ...data.income
      .filter((entry) => entry.toAccountId === account.id)
      .map((entry) => ({
        date: entry.date,
        type: "Income",
        category: entry.source,
        counterparty: account.bankName,
        amount: entry.amount,
        description: entry.description || "",
      })),
    ...data.expenses
      .filter((entry) => entry.fromAccountId === account.id)
      .map((entry) => ({
        date: entry.date,
        type: "Expense",
        category: entry.category,
        counterparty: entry.paymentMethod,
        amount: -entry.amount,
        description: entry.description || "",
      })),
    ...data.transfers
      .filter(
        (entry) =>
          entry.fromAccountId === account.id ||
          entry.toAccountId === account.id,
      )
      .map((entry) => ({
        date: entry.date,
        type:
          entry.fromAccountId === account.id ? "Transfer Out" : "Transfer In",
        category: "Transfer",
        counterparty:
          entry.fromAccountId === account.id
            ? entry.toAccountName
            : entry.fromAccountName,
        amount:
          entry.fromAccountId === account.id ? -entry.amount : entry.amount,
        description: entry.description || "",
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const header = "Date,Type,Category,Counterparty,Amount,Description";
  const rows = statementRows.map((row) =>
    [
      row.date,
      row.type,
      csvCell(row.category),
      csvCell(row.counterparty),
      row.amount.toFixed(2),
      csvCell(row.description),
    ].join(","),
  );

  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${account.bankName.replace(/\s+/g, "_").toLowerCase()}_statement.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function AccountQuickActionModal({
  action,
  data,
  updateData,
  onClose,
}: {
  action: { kind: "income" | "expense" | "transfer"; accountId: string } | null;
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
  onClose: () => void;
}) {
  const accounts = getAllAccounts(data);
  const account =
    accounts.find((item) => item.id === action?.accountId) || null;
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("");
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [source, setSource] = useState<IncomeSource>("Salary");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const expenseCategories = getExpenseCategories(data);
  const incomeSources = getIncomeSources(data);
  const methods = getExpenseMethods();
  const transferTargets = accounts.filter((item) => item.id !== account?.id);

  if (!action || !account) return null;

  const resetAndClose = () => {
    setAmount("");
    setCategory("");
    setMethod("UPI");
    setSource("Salary");
    setToAccountId("");
    setDate(new Date().toISOString().slice(0, 10));
    setNote("");
    onClose();
  };

  const handleSave = () => {
    const numericAmount = Number(amount);
    if (!numericAmount) return;

    if (action.kind === "income") {
      updateData(
        saveIncomeEntry(data, {
          id: crypto.randomUUID(),
          date,
          amount: numericAmount,
          source: source || incomeSources[0] || "Other",
          toAccountId: account.id,
          toAccountName: account.bankName,
          description: note,
        }),
      );
      resetAndClose();
      return;
    }

    if (action.kind === "expense") {
      updateData(
        saveExpenseEntry(data, {
          id: crypto.randomUUID(),
          date,
          amount: numericAmount,
          category: (category ||
            expenseCategories[0] ||
            "Other") as ExpenseCategory,
          fromAccountId: account.id,
          fromAccountName: account.bankName,
          paymentMethod: method,
          description: note,
        }),
      );
      resetAndClose();
      return;
    }

    const target =
      transferTargets.find((item) => item.id === toAccountId) ||
      transferTargets[0];
    if (!target) return;

    updateData(
      saveTransferEntry(data, {
        id: crypto.randomUUID(),
        date,
        amount: numericAmount,
        fromAccountId: account.id,
        fromAccountName: account.bankName,
        toAccountId: target.id,
        toAccountName: target.bankName,
        description: note,
        fees: 0,
      }),
    );
    resetAndClose();
  };

  const title =
    action.kind === "income"
      ? "Add Income"
      : action.kind === "expense"
        ? "Add Expense"
        : "Transfer Funds";

  return (
    <Modal isOpen={!!action} onClose={resetAndClose} title={title} mobileSheet>
      <div className="space-y-4">
        <Card className="bg-[color:var(--bg-3)]">
          <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-4)]">
            {action.kind === "transfer" ? "From account" : "Account"}
          </div>
          <div className="mt-1 text-[14px] font-semibold">
            {account.bankName}
          </div>
          <div className="mt-0.5 text-[11.5px] text-[color:var(--ink-4)]">
            {account.accountNumber || "Wallet"}
          </div>
        </Card>

        <Input
          label="Amount"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0"
        />

        {action.kind === "expense" && (
          <>
            <Select
              label="Category"
              value={category || expenseCategories[0] || ""}
              onChange={(event) =>
                setCategory(event.target.value as ExpenseCategory)
              }
            >
              {expenseCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              label="Method"
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as PaymentMethod)
              }
            >
              {methods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </>
        )}

        {action.kind === "income" && (
          <Select
            label="Source"
            value={source}
            onChange={(event) => setSource(event.target.value as IncomeSource)}
          >
            {incomeSources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        )}

        {action.kind === "transfer" && (
          <Select
            label="To Account"
            value={toAccountId || transferTargets[0]?.id || ""}
            onChange={(event) => setToAccountId(event.target.value)}
          >
            {transferTargets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.bankName}
              </option>
            ))}
          </Select>
        )}

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Input
          label="Note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional description"
        />

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} block disabled={!amount}>
            Save
          </Button>
          <Button variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
