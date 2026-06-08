import React, { useRef, useState } from "react";
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  CategoryDefinition,
  PortfolioData,
  ExpenseCategory,
  IncomeSource,
  PaymentMethod,
} from "../types";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Sheet,
} from "../components/UI";
import {
  getAllAccounts,
  getCategoryDisplayPath,
  mergeImportedCategories,
} from "../lib/utils";
import Icon from "../components/Icon";
import { normalizeStockName } from "../utils/stockNormalizer";

type ImportSummary = {
  incomeCount: number;
  expenseCount: number;
  skippedCount: number;
  investmentSkippedCount: number;
  invalidSkippedCount: number;
  unmatchedSkippedCount: number;
  importedIncomeCategories: number;
  importedExpenseCategories: number;
};

type PendingMyMoneyImport = {
  accounts: string[];
  categoryRows: Record<string, any>;
  transactionRows: Record<string, any>[];
  accountLookup: Record<string, string>;
};

type CategoryEditorState = {
  mode: "create" | "edit";
  type: "income" | "expense";
  category: CategoryDefinition | null;
};

const INVESTMENT_ACCOUNT_NAMES = new Set([
  "Grow Balance",
  "Zerodha Balance",
  "Mutual Funds",
  "Shares",
  "RD",
]);

const accountSourceMap: Record<string, PaymentMethod> = {
  Cash: "Cash",
  Card: "Card",
};

const accountNameMap: Record<string, string> = {
  "KOTAK BANK Account": "Kotak Bank",
  "AU SMALL FINANCE": "AU Small Finance Bank",
};

const incomeCategoryMap: Record<string, IncomeSource> = {
  salary: "Salary",
  job: "Salary",
  income: "Salary",
  interest: "Interest",
  allowance: "Other",
  bonus: "Other",
  "petty cash": "Other",
  shares: "Other",
  "existing balance": "Other",
};

const expenseCategoryKeywords: { match: RegExp; category: ExpenseCategory }[] =
  [
    { match: /(food|grocery|restaurant)/i, category: "Food" },
    { match: /(rent|house)/i, category: "Rent" },
    { match: /(medical|health|hospital|medicine)/i, category: "Medical" },
    { match: /(travel|transport|petrol|auto|cab)/i, category: "Travel" },
    { match: /(entertainment|movie|ott)/i, category: "Entertainment" },
    {
      match: /(utility|electric|internet|mobile|recharge)/i,
      category: "Utilities",
    },
  ];

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

export default function Settings({
  data,
  updateData,
  setActiveTab,
  clearAllData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
  setActiveTab: (tab: string) => void;
  clearAllData: () => Promise<void>;
}) {
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(
    null,
  );
  const [pendingImport, setPendingImport] =
    useState<PendingMyMoneyImport | null>(null);
  const [accountMappings, setAccountMappings] = useState<
    Record<string, string>
  >({});
  const [categoryEditor, setCategoryEditor] =
    useState<CategoryEditorState | null>(null);
  const myMoneyFileInputRef = useRef<HTMLInputElement | null>(null);
  const incomeCategories = data.settings?.incomeCategories || [];
  const expenseCategories = data.settings?.expenseCategories || [];
  const accountCount = getAllAccounts(data).length;
  const totalRecords =
    data.income.length +
    data.expenses.length +
    data.transfers.length +
    data.loans.length;
  const totalCategories = incomeCategories.length + expenseCategories.length;

  const exportToJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `myportfolio_backup_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFromJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const importedData = JSON.parse(loadEvent.target?.result as string);
        if (confirm("This will overwrite all current data. Are you sure?")) {
          updateData(normalizeImportedBackup(importedData, data));
          alert("Data imported successfully.");
        }
      } catch {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const exportToCsv = (type: "investments" | "expenses") => {
    let csvContent = "";
    if (type === "investments") {
      csvContent = "Type,Name,Reference,Invested,Current\n";
      data.investments.mutualFunds.forEach((fund) => {
        csvContent += `MF,"${fund.fundName}","${fund.amc}",${fund.currentValue},${fund.currentValue}\n`;
      });
      data.investments.stockPortfolios.forEach((portfolio) => {
        portfolio.holdings.forEach((holding) => {
          csvContent += `Stock,"${normalizeStockName(holding.companyName)}","${holding.ticker}",${holding.quantity * holding.avgBuyPrice},${holding.quantity * holding.currentPrice}\n`;
        });
      });
      data.investments.fd.forEach((fd) => {
        csvContent += `FD,"${fd.bankName}","FD",${fd.principal},${fd.principal}\n`;
      });
    } else {
      csvContent = "Date,Category,Method,Amount,Description\n";
      data.expenses.forEach((entry) => {
        csvContent += `${entry.date},${entry.category},${entry.paymentMethod},${entry.amount},"${entry.description || ""}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `myportfolio_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleMyMoneyImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
      });
      const db = new SQL.Database(new Uint8Array(buffer));

      const accountRows = queryRows(db, "SELECT uid, NIC_NAME FROM ASSETS;");
      const categoryRows = queryRows(
        db,
        "SELECT uid, NAME, TYPE, pUid FROM ZCATEGORY WHERE C_IS_DEL = 0;",
      );
      const transactionRows = queryRows(
        db,
        `SELECT uid, assetUid, ctgUid, ZCONTENT, ZDATE, DO_TYPE, ZMONEY, ASSET_NIC, CATEGORY_NAME
         FROM INOUTCOME
         WHERE IS_DEL = 0 AND DO_TYPE IN ('0', '1')
         ORDER BY ZDATE ASC;`,
      );

      const accountLookup = Object.fromEntries(
        accountRows.map((row) => [row.uid, row.NIC_NAME]),
      );
      const categories = Object.fromEntries(
        categoryRows.map((row) => [row.uid, row]),
      );
      const myMoneyAccounts: string[] = Array.from(
        new Set(
          accountRows
            .map((row) => normalizeAccountName(String(row.NIC_NAME || "")))
            .filter(Boolean),
        ),
      ) as string[];
      const initialMappings = Object.fromEntries(
        myMoneyAccounts.map((accountName) => [
          accountName,
          getDefaultImportMapping(accountName, data),
        ]),
      );
      setAccountMappings(initialMappings);
      setPendingImport({
        accounts: myMoneyAccounts,
        categoryRows: categories,
        transactionRows,
        accountLookup,
      });
    } catch (error) {
      console.error(error);
      alert("Failed to import the myMoney SQLite backup.");
    } finally {
      event.target.value = "";
    }
  };

  const handlePrintExport = () => {
    setActiveTab("dashboard");
    window.setTimeout(() => window.print(), 200);
  };

  const runMappedImport = () => {
    if (!pendingImport) return;
    let incomeCount = 0;
    let expenseCount = 0;
    let investmentSkippedCount = 0;
    let invalidSkippedCount = 0;
    let unmatchedSkippedCount = 0;
    const importedCategories = extractImportedCategories(
      pendingImport.categoryRows,
    );
    const importedIncome: PortfolioData["income"] = [];
    const importedExpenses: PortfolioData["expenses"] = [];

    pendingImport.transactionRows.forEach((row) => {
      const sourceAccountName = normalizeAccountName(
        pendingImport.accountLookup[row.assetUid] || row.ASSET_NIC || "",
      );
      const mappedAccountId = accountMappings[sourceAccountName] || "";
      if (!mappedAccountId || mappedAccountId === "skip") {
        investmentSkippedCount += 1;
        return;
      }

      const mappedAccount = getAllAccounts(data).find(
        (account) => account.id === mappedAccountId,
      );
      const category = pendingImport.categoryRows[row.ctgUid];
      const categoryType = Number(category?.TYPE ?? NaN);
      const categoryName = String(
        category?.NAME || row.CATEGORY_NAME || "",
      ).trim();
      const description = String(row.ZCONTENT || "").trim();
      const amount = Number(row.ZMONEY);
      let timestamp = Number(row.ZDATE);
      const doType = Number(row.DO_TYPE);

      if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e12) {
        timestamp = timestamp * 1000;
      }

      if (!Number.isFinite(amount) || !Number.isFinite(timestamp)) {
        invalidSkippedCount += 1;
        return;
      }

      const date = new Date(timestamp).toISOString().slice(0, 10);

      const categoryLabel =
        getImportedCategoryLabel(category, pendingImport.categoryRows) ||
        categoryName ||
        description;

      if (doType === 0 || categoryType === 2) {
        incomeCount += 1;
        importedIncome.push({
          id: `mymoney_${row.uid}`,
          date,
          source:
            categoryLabel || mapIncomeCategory(categoryName || description),
          amount,
          description:
            description || sourceAccountName || "Imported from myMoney",
          toAccountId: mappedAccountId,
          toAccountName: mappedAccount?.bankName || sourceAccountName,
        });
        return;
      }

      if (doType === 1 || categoryType === 1) {
        expenseCount += 1;
        importedExpenses.push({
          id: `mymoney_${row.uid}`,
          date,
          category:
            categoryLabel || mapExpenseCategory(categoryName || description),
          amount,
          fromAccountId: mappedAccountId,
          fromAccountName: mappedAccount?.bankName || sourceAccountName,
          paymentMethod: mapPaymentMethod(sourceAccountName),
          description: description || categoryName || "Imported from myMoney",
        });
        return;
      }

      unmatchedSkippedCount += 1;
    });

    const skippedCount =
      investmentSkippedCount + invalidSkippedCount + unmatchedSkippedCount;
    updateData({
      income: mergeImportedEntries(data.income, importedIncome),
      expenses: mergeImportedEntries(data.expenses, importedExpenses),
      settings: {
        ...data.settings,
        incomeCategories: mergeImportedCategories(
          incomeCategories,
          importedCategories.income,
        ),
        expenseCategories: mergeImportedCategories(
          expenseCategories,
          importedCategories.expense,
        ),
      },
    });
    setPendingImport(null);
    setImportSummary({
      incomeCount,
      expenseCount,
      skippedCount,
      investmentSkippedCount,
      invalidSkippedCount,
      unmatchedSkippedCount,
      importedIncomeCategories: importedCategories.income.length,
      importedExpenseCategories: importedCategories.expense.length,
    });
  };

  const handleSaveCategory = (
    nextCategory: CategoryDefinition,
    previousCategory?: CategoryDefinition | null,
  ) => {
    updateData(
      applyCategoryUpsert(data, nextCategory, previousCategory || null),
    );
    setCategoryEditor(null);
  };

  const handleDeleteCategory = (category: CategoryDefinition) => {
    const label = getCategoryDisplayPath(
      category,
      category.type === "income" ? incomeCategories : expenseCategories,
    );
    if (
      !confirm(`Delete "${label}"? Linked transactions will be moved to Other.`)
    )
      return;
    updateData(applyCategoryDelete(data, category));
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0">
      <div>
        <div className="font-display text-[20px] font-semibold">Settings</div>
        <div className="text-[11.5px] text-[color:var(--ink-4)]">
          Manage account, data and preferences
        </div>
      </div>

      <Card className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-12 place-items-center rounded-full font-display text-[16px] font-semibold"
                style={{
                  background:
                    "color-mix(in oklch, var(--accent) 18%, transparent)",
                  color: "var(--accent)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklch, var(--accent) 40%, transparent)",
                }}
              >
                RS
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold">Ronit S.</div>
                <div className="text-[11.5px] text-[color:var(--ink-4)]">
                  Single-owner workspace
                </div>
              </div>
              <Badge variant="secondary">Owner</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ProfileMetric label="Accounts" value={String(accountCount)} />
              <ProfileMetric label="Records" value={String(totalRecords)} />
              <ProfileMetric
                label="Categories"
                value={String(totalCategories)}
              />
            </div>
          </div>
        </div>
      </Card>

      <SettingsSectionLabel title="Account" />
      <Card padded={false}>
        <SettingsListRow
          icon="shield"
          label="Workspace mode"
          hint="Local-first browser workspace with backup-friendly tools."
          action={<Badge variant="success">Local-first</Badge>}
        />
        <SettingsListRow
          icon="sparkle"
          label="Print / PDF"
          hint="Open a print-friendly dashboard summary and save it as PDF."
          action={
            <Button variant="secondary" size="sm" onClick={handlePrintExport}>
              Export PDF
            </Button>
          }
        />
      </Card>

      <SettingsSectionLabel title="Preferences" />
      <Card padded={false}>
        <SettingsListRow
          icon="wallet"
          label="Monthly budget"
          hint="Used for dashboard pacing and monthly spend tracking."
          action={
            <div className="w-full md:w-[180px]">
              <Input
                type="number"
                value={String(data.settings.monthlyBudget ?? 0)}
                onChange={(event) =>
                  updateData({
                    settings: {
                      ...data.settings,
                      monthlyBudget: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          }
        />
        <SettingsListRow
          icon="calendar"
          label="Year view"
          hint="Switch analytics between calendar and financial year."
          action={
            <div className="w-full md:w-[180px]">
              <Select
                value={data.settings.yearView}
                onChange={(event) =>
                  updateData({
                    settings: {
                      ...data.settings,
                      yearView: event.target
                        .value as PortfolioData["settings"]["yearView"],
                    },
                  })
                }
              >
                <option value="calendar">Calendar Year</option>
                <option value="financial">Financial Year</option>
              </Select>
            </div>
          }
        />
        <SettingsListRow
          icon="tags"
          label="Manage categories"
          hint={`${expenseCategories.filter((item) => !item.parentId).length} expense groups | ${incomeCategories.filter((item) => !item.parentId).length} income groups`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                document
                  .getElementById("category-manager")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Open manager
            </Button>
          }
        />
      </Card>

      <SettingsSectionLabel title="Data" />
      <Card padded={false}>
        <SettingsListRow
          icon="download"
          label="Full backup"
          hint="Export your complete portfolio dataset as JSON."
          action={
            <Button variant="secondary" size="sm" onClick={exportToJson}>
              Export JSON
            </Button>
          }
        />
        <SettingsListRow
          icon="upload"
          label="Restore backup"
          hint="Import a JSON backup and replace the current dataset."
          action={
            <label className="block">
              <span className="sr-only">Import JSON backup</span>
              <div className="cursor-pointer">
                <Button variant="secondary" size="sm">Import JSON</Button>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={importFromJson}
                className="hidden"
              />
            </label>
          }
        />
        <SettingsListRow
          icon="database"
          label="CSV exports"
          hint="Download investments or expenses in spreadsheet-friendly files."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCsv("investments")}
              >
                Investments
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCsv("expenses")}
              >
                Expenses
              </Button>
            </div>
          }
        />
        <SettingsListRow
          icon="upload"
          label="Import from myMoney (.sqlite)"
          hint="Read the Android SQLite export in-browser and merge matching entries."
          action={
            <>
              <Button
                size="sm"
                onClick={() => myMoneyFileInputRef.current?.click()}
              >
                Select SQLite File
              </Button>
              <input
                ref={myMoneyFileInputRef}
                type="file"
                accept=".sqlite,.db"
                className="hidden"
                onChange={handleMyMoneyImport}
              />
            </>
          }
        />
      </Card>

      <div id="category-manager">
        <Card
          title="Category Manager"
          subtitle="Maintain grouped income and expense paths used across forms and reports."
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CategoryManagerColumn
              title="Expense tree"
              categories={expenseCategories}
              type="expense"
              onCreate={() =>
                setCategoryEditor({
                  mode: "create",
                  type: "expense",
                  category: null,
                })
              }
              onEdit={(category) =>
                setCategoryEditor({ mode: "edit", type: "expense", category })
              }
              onDelete={handleDeleteCategory}
            />
            <CategoryManagerColumn
              title="Income tree"
              categories={incomeCategories}
              type="income"
              onCreate={() =>
                setCategoryEditor({
                  mode: "create",
                  type: "income",
                  category: null,
                })
              }
              onEdit={(category) =>
                setCategoryEditor({ mode: "edit", type: "income", category })
              }
              onDelete={handleDeleteCategory}
            />
          </div>
        </Card>
      </div>

      <SettingsSectionLabel title="Danger Zone" />
      <Card padded={false}>
        <SettingsListRow
          icon="trash"
          label="Clear all data"
          hint="Delete all locally stored portfolio data from this browser. This cannot be undone."
          destructive
          action={
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    "CRITICAL: This will delete ALL your data forever. Are you sure?",
                  )
                ) {
                  void clearAllData();
                }
              }}
            >
              Clear all
            </Button>
          }
        />
      </Card>

      <Modal
        isOpen={!!importSummary}
        onClose={() => setImportSummary(null)}
        title="myMoney Import Summary"
      >
        {importSummary && (
          <div className="space-y-4">
            <Card className="bg-[color:var(--bg-3)] text-[12.5px] text-[color:var(--ink-2)]">
              Imported {importSummary.incomeCount} income entries and{" "}
              {importSummary.expenseCount} expense entries. Skipped{" "}
              {importSummary.skippedCount} rows that were transfers,
              investment-linked, invalid, or unmatched.
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MiniPanel
                title="Investment skipped"
                subtitle={String(importSummary.investmentSkippedCount)}
                tone="var(--warn)"
              />
              <MiniPanel
                title="Invalid rows"
                subtitle={String(importSummary.invalidSkippedCount)}
                tone="var(--neg)"
              />
              <MiniPanel
                title="Unmatched rows"
                subtitle={String(importSummary.unmatchedSkippedCount)}
                tone="var(--info)"
              />
              <MiniPanel
                title="Income merged"
                subtitle={String(importSummary.importedIncomeCategories)}
                tone="var(--pos)"
              />
              <MiniPanel
                title="Expense merged"
                subtitle={String(importSummary.importedExpenseCategories)}
                tone="var(--warn)"
              />
            </div>
            <Button onClick={() => setImportSummary(null)} block>
              Close
            </Button>
          </div>
        )}
      </Modal>

      <Sheet
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title="Map myMoney Accounts"
        subtitle="Link imported account names to your portfolio accounts before merging."
        footer={
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              block
              onClick={() => setPendingImport(null)}
            >
              Cancel
            </Button>
            <Button type="button" block onClick={runMappedImport}>
              Import Now
            </Button>
          </div>
        }
      >
        {pendingImport && (
          <div className="space-y-3">
            {pendingImport.accounts.map((accountName) => (
              <Card
                key={accountName}
                className="bg-[color:var(--bg-3)]"
                padded={false}
              >
                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr] md:items-center">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">
                      {accountName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">
                      Choose destination account or mark as investment.
                    </div>
                  </div>
                  <Select
                    value={accountMappings[accountName] || ""}
                    onChange={(event) =>
                      setAccountMappings((current) => ({
                        ...current,
                        [accountName]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select account</option>
                    {getAllAccounts(data).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.bankName}
                      </option>
                    ))}
                    <option value="skip">Skip (Investment)</option>
                  </Select>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Sheet>

      <CategoryEditorModal
        editor={categoryEditor}
        data={data}
        onClose={() => setCategoryEditor(null)}
        onSave={handleSaveCategory}
      />
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[color:var(--bg-3)] px-3 py-2.5 hairline">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-4)]">
        {label}
      </div>
      <div className="mt-1 font-display text-[16px] font-semibold">{value}</div>
    </div>
  );
}

function SettingsSectionLabel({ title }: { title: string }) {
  return (
    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
      {title}
    </div>
  );
}

function SettingsListRow({
  icon,
  label,
  hint,
  action,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  hint: string;
  action?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="border-t border-white/[0.05] first:border-t-0">
      <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="grid h-9 w-9 place-items-center rounded-[10px]"
            style={
              destructive
                ? {
                    background:
                      "color-mix(in oklch, var(--neg) 15%, transparent)",
                    color: "var(--neg)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklch, var(--neg) 30%, transparent)",
                  }
                : {
                    background: "rgba(255,255,255,0.03)",
                    color: "var(--ink-2)",
                    boxShadow: "inset 0 0 0 1px var(--line)",
                  }
            }
          >
            <Icon name={icon} size={16} />
          </div>
          <div className="min-w-0">
            <div
              className={`text-[13.5px] font-semibold ${destructive ? "text-[color:var(--neg)]" : "text-[color:var(--ink)]"}`}
            >
              {label}
            </div>
            <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">
              {hint}
            </div>
          </div>
        </div>
        {action && <div className="w-full md:w-auto">{action}</div>}
      </div>
    </div>
  );
}

function MiniPanel({
  title,
  subtitle,
  tone,
}: {
  title: string;
  subtitle: string;
  tone: string;
}) {
  return (
    <div className="rounded-[16px] bg-[color:var(--bg-3)] p-4 hairline">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
        <div className="text-[12px] font-semibold text-[color:var(--ink-2)]">
          {title}
        </div>
      </div>
      <div className="mt-1 text-[11.5px] text-[color:var(--ink-4)]">
        {subtitle}
      </div>
    </div>
  );
}

function queryRows(
  db: { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> },
  sql: string,
) {
  const result = db.exec(sql);
  if (!result[0]) return [];
  const { columns, values } = result[0];
  return values.map((row: unknown[]) =>
    columns.reduce(
      (acc: Record<string, unknown>, column: string, index: number) => {
        acc[column] = row[index];
        return acc;
      },
      {},
    ),
  );
}

function CategoryManagerColumn({
  title,
  categories,
  type,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string;
  categories: CategoryDefinition[];
  type: "income" | "expense";
  onCreate: () => void;
  onEdit: (category: CategoryDefinition) => void;
  onDelete: (category: CategoryDefinition) => void;
}) {
  const orderedCategories = [...categories].sort((a, b) => {
    if ((a.parentId ? 1 : 0) !== (b.parentId ? 1 : 0))
      return (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0);
    return getCategoryDisplayPath(a, categories).localeCompare(
      getCategoryDisplayPath(b, categories),
    );
  });

  return (
    <div className="rounded-[18px] bg-[color:var(--bg-3)] p-4 hairline">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[color:var(--ink)]">
            {title}
          </div>
          <div className="text-[11px] text-[color:var(--ink-4)]">
            {orderedCategories.length} entries
          </div>
        </div>
        <Button
          size="sm"
          onClick={onCreate}
          icon={<Icon name="plus" size={14} />}
        >
          Add
        </Button>
      </div>
      <div className="max-h-96 space-y-2 overflow-auto pr-1 no-scrollbar">
        {orderedCategories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between gap-3 rounded-[14px] bg-[color:var(--bg-2)] px-4 py-3 hairline"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] text-[color:var(--ink)]">
                {getCategoryDisplayPath(category, categories)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={type === "expense" ? "warning" : "success"}>
                  {type}
                </Badge>
                <Badge variant={category.parentId ? "info" : "secondary"}>
                  {category.parentId ? "Subcategory" : "Top Level"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(category)}
                className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--ink)]"
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                onClick={() => onDelete(category)}
                className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
        {orderedCategories.length === 0 && (
          <div className="rounded-[14px] bg-[color:var(--bg-2)] px-4 py-8 text-center text-[12px] text-[color:var(--ink-4)] hairline">
            No categories yet.
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryEditorModal({
  editor,
  data,
  onClose,
  onSave,
}: {
  editor: CategoryEditorState | null;
  data: PortfolioData;
  onClose: () => void;
  onSave: (
    nextCategory: CategoryDefinition,
    previousCategory?: CategoryDefinition | null,
  ) => void;
}) {
  if (!editor) return null;
  const categories =
    editor.type === "income"
      ? data.settings?.incomeCategories || []
      : data.settings?.expenseCategories || [];
  const topLevelCategories = categories.filter(
    (category) => !category.parentId && category.id !== editor.category?.id,
  );

  return (
    <Modal
      isOpen={!!editor}
      onClose={onClose}
      title={editor.mode === "edit" ? "Edit Category" : "Add Category"}
      mobileSheet
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const parentId = String(formData.get("parentId") || "") || null;
          const parentCategory = parentId
            ? categories.find((category) => category.id === parentId)
            : null;
          onSave(
            {
              id: editor.category?.id || `cat_${editor.type}_${Date.now()}`,
              name: String(formData.get("name") || "").trim(),
              parentId,
              parentName: parentCategory?.name || null,
              type: editor.type,
            },
            editor.category,
          );
        }}
        className="space-y-4"
      >
        <Input
          label="Category Name"
          name="name"
          required
          defaultValue={editor.category?.name || ""}
        />
        <Select
          label="Parent Category"
          name="parentId"
          defaultValue={editor.category?.parentId || ""}
        >
          <option value="">None (Top Level)</option>
          {topLevelCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <div className="rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-[12px] text-[color:var(--ink-3)] hairline">
          Top-level categories appear directly in reports and forms.
          Subcategories are stored with their parent path, like `Food / Dining`.
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="submit" block>
            {editor.mode === "edit" ? "Update Category" : "Create Category"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function mergeImportedEntries<T extends { id: string }>(
  existing: T[],
  imported: T[],
) {
  const untouched = existing.filter(
    (entry) => !entry.id.startsWith("mymoney_"),
  );
  const existingImported = new Map(
    existing
      .filter((entry) => entry.id.startsWith("mymoney_"))
      .map((entry) => [entry.id, entry]),
  );
  imported.forEach((entry) => existingImported.set(entry.id, entry));
  return [...untouched, ...Array.from(existingImported.values())];
}

function normalizeAccountName(name = "") {
  return accountNameMap[name] || name;
}

function shouldSkipInvestmentAccount(name = "") {
  return INVESTMENT_ACCOUNT_NAMES.has(name);
}

function mapPaymentMethod(accountName = ""): PaymentMethod {
  return accountSourceMap[accountName] || "UPI";
}

function mapIncomeCategory(name = ""): IncomeSource {
  const lower = name.toLowerCase();
  const matched = Object.entries(incomeCategoryMap).find(([keyword]) =>
    lower.includes(keyword),
  );
  return matched?.[1] || "Other";
}

function mapExpenseCategory(name = ""): ExpenseCategory {
  const match = expenseCategoryKeywords.find((item) => item.match.test(name));
  return match?.category || "Other";
}

function getDefaultImportMapping(accountName: string, data: PortfolioData) {
  if (shouldSkipInvestmentAccount(accountName)) return "skip";
  const matched = getAllAccounts(data).find(
    (account) => account.bankName.toLowerCase() === accountName.toLowerCase(),
  );
  return matched?.id || "";
}

function getImportedCategoryLabel(
  category: Record<string, any> | undefined,
  categoryRows: Record<string, any>,
) {
  if (!category) return "";
  const name = String(category.NAME || "").trim();
  if (!name) return "";
  if (!category.pUid) return name;
  const parent = categoryRows[String(category.pUid)];
  const parentName = String(parent?.NAME || "").trim();
  return parentName ? `${parentName} / ${name}` : name;
}

function extractImportedCategories(categoryRows: Record<string, any>): {
  income: CategoryDefinition[];
  expense: CategoryDefinition[];
} {
  const rows = Object.values(categoryRows || {}) as Array<Record<string, any>>;
  const byId = new Map(rows.map((row) => [String(row.uid), row]));
  const income: CategoryDefinition[] = [];
  const expense: CategoryDefinition[] = [];

  rows.forEach((row) => {
    const type =
      Number(row.TYPE) === 2
        ? "income"
        : Number(row.TYPE) === 1
          ? "expense"
          : null;
    if (!type) return;
    const id = `mymoney_${row.uid}`;
    const name = String(row.NAME || "").trim();
    if (!name) return;
    const parent = row.pUid ? byId.get(String(row.pUid)) : null;
    const category: CategoryDefinition = {
      id,
      name,
      parentId: parent ? `mymoney_${parent.uid}` : null,
      parentName: parent ? String(parent.NAME || "").trim() || null : null,
      type,
    };
    if (type === "income") income.push(category);
    else expense.push(category);
  });

  return { income, expense };
}

function normalizeImportedBackup(
  importedData: any,
  currentData: PortfolioData,
) {
  return {
    ...importedData,
    transfers: importedData.transfers || [],
    recurringRules: importedData.recurringRules || [],
    settings: {
      ...currentData.settings,
      ...(importedData.settings || {}),
      incomeCategories:
        importedData.settings?.incomeCategories ||
        currentData.settings.incomeCategories ||
        [],
      expenseCategories:
        importedData.settings?.expenseCategories ||
        currentData.settings.expenseCategories ||
        [],
    },
  };
}

function applyCategoryUpsert(
  data: PortfolioData,
  nextCategory: CategoryDefinition,
  previousCategory: CategoryDefinition | null,
) {
  const key =
    nextCategory.type === "income" ? "incomeCategories" : "expenseCategories";
  const existingCategories = data.settings[key];
  const nextCategories = previousCategory
    ? existingCategories
        .map((category) =>
          category.id === previousCategory.id ? nextCategory : category,
        )
        .map((category) =>
          category.parentId === nextCategory.id
            ? { ...category, parentName: nextCategory.name }
            : category,
        )
    : [...existingCategories, nextCategory];

  if (!previousCategory) {
    return {
      settings: {
        ...data.settings,
        [key]: nextCategories,
      },
    };
  }

  const previousDisplayMap = buildCategoryDisplayMap(existingCategories);
  const nextDisplayMap = buildCategoryDisplayMap(nextCategories);
  const impactedIds = new Set<string>([
    previousCategory.id,
    ...getDescendantCategoryIds(existingCategories, previousCategory.id),
  ]);
  const remapEntries = new Map<string, string>();

  impactedIds.forEach((id) => {
    const previousCategoryDef = existingCategories.find(
      (category) => category.id === id,
    );
    const nextCategoryDef = nextCategories.find(
      (category) => category.id === id,
    );
    if (!previousCategoryDef || !nextCategoryDef) return;
    const previousLabel =
      previousDisplayMap.get(id) || previousCategoryDef.name;
    const nextLabel = nextDisplayMap.get(id) || nextCategoryDef.name;
    remapEntries.set(previousLabel, nextLabel);
    remapEntries.set(previousCategoryDef.name, nextLabel);
  });

  return {
    income:
      nextCategory.type === "income"
        ? data.income.map((entry) => ({
            ...entry,
            source: remapEntries.get(entry.source) || entry.source,
          }))
        : data.income,
    expenses:
      nextCategory.type === "expense"
        ? data.expenses.map((entry) => ({
            ...entry,
            category: remapEntries.get(entry.category) || entry.category,
          }))
        : data.expenses,
    recurringRules:
      nextCategory.type === "expense"
        ? data.recurringRules.map((rule) => ({
            ...rule,
            category: remapEntries.get(rule.category) || rule.category,
          }))
        : data.recurringRules,
    settings: {
      ...data.settings,
      [key]: nextCategories,
    },
  };
}

function applyCategoryDelete(
  data: PortfolioData,
  categoryToDelete: CategoryDefinition,
) {
  const key =
    categoryToDelete.type === "income"
      ? "incomeCategories"
      : "expenseCategories";
  const existingCategories = data.settings[key];
  const removedIds = new Set<string>([
    categoryToDelete.id,
    ...getDescendantCategoryIds(existingCategories, categoryToDelete.id),
  ]);
  const previousDisplayMap = buildCategoryDisplayMap(existingCategories);
  const nextCategories = existingCategories.filter(
    (category) => !removedIds.has(category.id),
  );
  const fallbackLabel = getFallbackCategoryLabel(
    nextCategories,
    categoryToDelete.type,
  );
  const removedLabels = new Set<string>();

  removedIds.forEach((id) => {
    const category = existingCategories.find((item) => item.id === id);
    if (!category) return;
    removedLabels.add(previousDisplayMap.get(id) || category.name);
    removedLabels.add(category.name);
  });

  return {
    income:
      categoryToDelete.type === "income"
        ? data.income.map((entry) => ({
            ...entry,
            source: removedLabels.has(entry.source)
              ? fallbackLabel
              : entry.source,
          }))
        : data.income,
    expenses:
      categoryToDelete.type === "expense"
        ? data.expenses.map((entry) => ({
            ...entry,
            category: removedLabels.has(entry.category)
              ? fallbackLabel
              : entry.category,
          }))
        : data.expenses,
    recurringRules:
      categoryToDelete.type === "expense"
        ? data.recurringRules.map((rule) => ({
            ...rule,
            category: removedLabels.has(rule.category)
              ? fallbackLabel
              : rule.category,
          }))
        : data.recurringRules,
    settings: {
      ...data.settings,
      [key]: nextCategories,
    },
  };
}

function buildCategoryDisplayMap(categories: CategoryDefinition[]) {
  return new Map(
    categories.map((category) => [
      category.id,
      getCategoryDisplayPath(category, categories),
    ]),
  );
}

function getDescendantCategoryIds(
  categories: CategoryDefinition[],
  categoryId: string,
): string[] {
  const descendants: string[] = [];
  const queue = [categoryId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    categories
      .filter((category) => category.parentId === current)
      .forEach((child) => {
        descendants.push(child.id);
        queue.push(child.id);
      });
  }
  return descendants;
}

function getFallbackCategoryLabel(
  categories: CategoryDefinition[],
  type: "income" | "expense",
) {
  const other = categories.find(
    (category) =>
      !category.parentId &&
      category.name.toLowerCase() === "other" &&
      category.type === type,
  );
  return other ? getCategoryDisplayPath(other, categories) : "Other";
}
