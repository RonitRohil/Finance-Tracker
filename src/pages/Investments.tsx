import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Badge, Button, Card, Input, Modal, Select } from "../components/UI";
import {
  BrokerType,
  FixedDeposit,
  MFCategory,
  MutualFund,
  PortfolioData,
  RecurringDeposit,
  Stock,
  StockPortfolio,
} from "../types";
import {
  calculateFDValue,
  calculateRDInvested,
  calculateRDValue,
  calculateWeightedAverage,
  formatCurrency,
  getAllAccounts,
  getCombinedStockHoldings,
  getComputedSipInvested,
  getMutualFundInvestedAmount,
  parseCSV,
} from "../lib/utils";
import {
  getTickerFromName,
  isSameStock,
  normalizeStockName,
} from "../utils/stockNormalizer";

type InvestmentTab = "mf" | "stocks" | "fd" | "rd";

type InvestmentTotals = {
  invested: number;
  current: number;
};

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

function getGainLoss(totals: InvestmentTotals) {
  const amount = totals.current - totals.invested;
  return {
    amount,
    pct: totals.invested > 0 ? (amount / totals.invested) * 100 : 0,
  };
}

function getStockPortfolioTotals(portfolio: StockPortfolio): InvestmentTotals {
  return portfolio.holdings.reduce(
    (totals, holding) => ({
      invested: totals.invested + holding.quantity * holding.avgBuyPrice,
      current: totals.current + holding.quantity * holding.currentPrice,
    }),
    { invested: 0, current: 0 },
  );
}

function SegmentedTabs({
  value,
  onChange,
  counts,
}: {
  value: InvestmentTab;
  onChange: (value: InvestmentTab) => void;
  counts: Record<InvestmentTab, number>;
}) {
  const options: Array<{ id: InvestmentTab; label: string }> = [
    { id: "mf", label: "Mutual Funds" },
    { id: "stocks", label: "Stocks" },
    { id: "fd", label: "FDs" },
    { id: "rd", label: "RDs" },
  ];

  return (
    <div className="inline-flex min-w-max rounded-full bg-[color:var(--bg-3)] p-1 hairline">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
              active ? "bg-[color:var(--accent)] text-[color:var(--bg)]" : "text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
            }`}
          >
            {option.label}
            <span className={`rounded-full px-1.5 py-[1px] text-[9.5px] font-mono-num ${active ? "bg-black/20" : "bg-white/[0.05]"}`}>{counts[option.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Investments({
  data,
  updateData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const [subTab, setSubTab] = useState<InvestmentTab>("mf");
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<StockPortfolio | null>(null);
  const [activePortfolioId, setActivePortfolioId] = useState<string>("all");

  const accounts = useMemo(() => getAllAccounts(data), [data]);
  const stockHoldings = getCombinedStockHoldings(data);
  const mutualFundsInvested = data.investments.mutualFunds.reduce((sum, fund) => sum + getMutualFundInvestedAmount(fund), 0);
  const mutualFundsCurrent = data.investments.mutualFunds.reduce((sum, fund) => sum + fund.currentValue, 0);
  const stocksInvested = stockHoldings.reduce((sum, holding) => sum + holding.totalInvested, 0);
  const stocksCurrent = stockHoldings.reduce((sum, holding) => sum + holding.totalCurrentValue, 0);
  const fdCurrent = data.investments.fd.reduce((sum, fd) => sum + calculateFDValue(fd.principal, fd.interestRate, fd.startDate, fd.maturityDate), 0);
  const rdCurrent = data.investments.rd.reduce((sum, rd) => sum + calculateRDValue(rd.monthlyDeposit, rd.interestRate, rd.startDate, rd.maturityDate), 0);
  const fdInvested = data.investments.fd.reduce((sum, fd) => sum + fd.principal, 0);
  const rdInvested = data.investments.rd.reduce((sum, rd) => sum + calculateRDInvested(rd.monthlyDeposit, rd.startDate, rd.maturityDate), 0);
  const mutualFundTotals = { invested: mutualFundsInvested, current: mutualFundsCurrent };
  const stockTotals = { invested: stocksInvested, current: stocksCurrent };
  const fdTotals = { invested: fdInvested, current: fdCurrent };
  const rdTotals = { invested: rdInvested, current: rdCurrent };
  const totalCurrent = mutualFundsCurrent + stocksCurrent + fdCurrent + rdCurrent;
  const totalInvested = mutualFundsInvested + stocksInvested + fdInvested + rdInvested;
  const pnl = totalCurrent - totalInvested;
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

  const counts = {
    mf: data.investments.mutualFunds.length,
    stocks: stockHoldings.length,
    fd: data.investments.fd.length,
    rd: data.investments.rd.length,
  };

  const activePortfolio = data.investments.stockPortfolios.find((portfolio) => portfolio.id === activePortfolioId) || null;
  const activePortfolioTotals = activePortfolio ? getStockPortfolioTotals(activePortfolio) : stockTotals;
  const portfolioSummaries = data.investments.stockPortfolios.map((portfolio) => ({
    portfolio,
    totals: getStockPortfolioTotals(portfolio),
  }));

  const openCreateForTab = () => {
    if (subTab === "stocks" && data.investments.stockPortfolios.length === 0) {
      setEditingPortfolio(null);
      setIsPortfolioModalOpen(true);
      return;
    }
    setEditingItem(null);
    setIsItemModalOpen(true);
  };

  const removeItem = (id: string) => {
    if (!confirm("Delete this item?")) return;

    if (subTab === "mf") {
      updateData({ investments: { ...data.investments, mutualFunds: data.investments.mutualFunds.filter((item) => item.id !== id) } });
      return;
    }
    if (subTab === "fd") {
      updateData({ investments: { ...data.investments, fd: data.investments.fd.filter((item) => item.id !== id) } });
      return;
    }
    if (subTab === "rd") {
      updateData({ investments: { ...data.investments, rd: data.investments.rd.filter((item) => item.id !== id) } });
      return;
    }
    if (subTab === "stocks" && activePortfolio) {
      updateData({
        investments: {
          ...data.investments,
          stockPortfolios: data.investments.stockPortfolios.map((portfolio) =>
            portfolio.id === activePortfolio.id ? { ...portfolio, holdings: portfolio.holdings.filter((holding) => holding.id !== id) } : portfolio,
          ),
        },
      });
    }
  };

  const handleImport = (portfolioId: string, broker: BrokerType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const rows = parseCSV(await file.text());
      const portfolio = data.investments.stockPortfolios.find((item) => item.id === portfolioId);
      if (!portfolio) return;

      const findCol = (row: Record<string, string>, aliases: string[]) => {
        const key = Object.keys(row).find((candidate) => aliases.map((alias) => alias.toLowerCase()).includes(candidate.toLowerCase().trim()));
        return key ? row[key] : undefined;
      };
      const parseNum = (value?: string) => Number((value || "").replace(/[^0-9.-]/g, ""));
      const holdings: Stock[] = [];

      rows.forEach((row) => {
        let ticker = "";
        let companyName = "";

        if (broker === "Groww") {
          companyName = normalizeStockName(findCol(row, ["Stock Name", "Stock", "Company", "Instrument"]) || "");
          ticker = ((findCol(row, ["Ticker", "Symbol"]) || getTickerFromName(companyName)) as string).toUpperCase();
        } else if (broker === "Zerodha") {
          ticker = ((findCol(row, ["Instrument", "Symbol", "Ticker"]) || "") as string).toUpperCase();
          companyName = normalizeStockName(ticker);
        } else {
          companyName = normalizeStockName(findCol(row, ["Stock Name", "Company", "Stock"]) || "");
          ticker = ((findCol(row, ["Ticker", "Symbol", "Instrument"]) || getTickerFromName(companyName)) as string).toUpperCase();
        }

        const quantity = parseNum(findCol(row, ["Quantity", "Qty", "Qty.", "Shares"]));
        const avgBuyPrice = parseNum(findCol(row, ["Average buy price", "Average Price", "Avg Price", "Avg Cost", "Avg. cost"]));
        const currentPrice = parseNum(findCol(row, ["Closing price", "Current Price", "LTP", "Market Price"]));

        if (!companyName || !ticker || quantity <= 0) return;

        const existing = portfolio.holdings.find((item) => isSameStock(item.companyName, companyName));
        holdings.push({
          id: existing?.id || Math.random().toString(36).slice(2, 11),
          companyName,
          ticker,
          quantity,
          avgBuyPrice,
          currentPrice: currentPrice > 0 ? currentPrice : existing?.currentPrice || avgBuyPrice,
        });
      });

      if (holdings.length === 0) {
        alert("No supported stock rows were found in that CSV.");
        return;
      }

      updateData({
        investments: {
          ...data.investments,
          stockPortfolios: data.investments.stockPortfolios.map((item) => (item.id === portfolioId ? { ...item, holdings } : item)),
        },
      });
      alert("CSV import completed.");
    };
    input.click();
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[20px] font-semibold">Investments</div>
          <div className="text-[11.5px] text-[color:var(--ink-4)]">Portfolio overview</div>
        </div>
        <Button size="sm" variant="secondary" onClick={openCreateForTab} icon={<Icon name="plus" size={14} />}>
          Add
        </Button>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(120% 80% at 100% 0%, color-mix(in oklch, var(--violet) 25%, transparent), transparent 60%)" }} />
        <div className="relative">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-4)]">Current value</div>
          <div className="mt-1 font-display text-[30px] font-semibold tabular">{formatCurrency(totalCurrent)}</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={pnl >= 0 ? "success" : "danger"}>
              <Icon name={pnl >= 0 ? "trend-up" : "trend-down"} size={10} />
              {pnl >= 0 ? "+" : ""}{compactINR(pnl)} ({pnlPct.toFixed(1)}%)
            </Badge>
            <span className="text-[11.5px] text-[color:var(--ink-4)]">Invested {compactINR(totalInvested)}</span>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5">
            {[
              { value: mutualFundsCurrent, color: "var(--violet)" },
              { value: stocksCurrent, color: "var(--info)" },
              { value: fdCurrent + rdCurrent, color: "var(--warn)" },
            ].map((item, index, array) => {
              const sum = array.reduce((acc, next) => acc + next.value, 0) || 1;
              return <div key={index} style={{ width: `${(item.value / sum) * 100}%`, background: item.color }} />;
            })}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10.5px]">
            {[
              ["Mutual Funds", "var(--violet)", mutualFundsCurrent],
              ["Stocks", "var(--info)", stocksCurrent],
              ["FDs/RDs", "var(--warn)", fdCurrent + rdCurrent],
            ].map(([label, color, value]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: color as string }} />
                <span className="truncate text-[color:var(--ink-3)]">{label}</span>
                <span className="ml-auto font-mono-num text-[color:var(--ink-2)]">{compactINR(value as number)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
        <SegmentedTabs value={subTab} onChange={setSubTab} counts={counts} />
      </div>

      {subTab === "mf" && (
        <div className="space-y-2.5">
          <TotalsCard title="Mutual fund total" totals={mutualFundTotals} />
          {data.investments.mutualFunds.map((fund) => {
            const invested = getMutualFundInvestedAmount(fund);
            const gainLoss = fund.currentValue - invested;
            const pct = invested > 0 ? (gainLoss / invested) * 100 : 0;
            const sip = fund.sipDetails;

            return (
              <Card key={fund.id} padded={false}>
                <div className="flex items-center gap-3 p-4">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-[12px] font-display text-[11px] font-semibold"
                    style={{ background: "color-mix(in oklch, var(--violet) 18%, transparent)", color: "var(--violet)", boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--violet) 40%, transparent)" }}
                  >
                    {fund.amc.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-[13.5px] font-semibold">{fund.fundName}</div>
                      {sip && <Badge variant={sip.status === "Active" ? "success" : "warning"}>{sip.status}</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[color:var(--ink-4)]">
                      {fund.category} · SIP {sip ? compactINR(sip.monthlyAmount) : "-"} /mo
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingItem(fund); setIsItemModalOpen(true); }} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05]">
                      <Icon name="pencil" size={14} />
                    </button>
                    <button onClick={() => removeItem(fund.id)} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex divide-x divide-white/[0.05] px-2 pb-3">
                  {[
                    ["Invested", compactINR(invested), undefined],
                    ["Current", compactINR(fund.currentValue), undefined],
                    ["P&L", `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, pct >= 0 ? "var(--pos)" : "var(--neg)"],
                  ].map(([label, value, color], index) => (
                    <div key={index} className="flex-1 px-2">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">{label}</div>
                      <div className="font-mono-num text-[13px] font-semibold tabular" style={color ? { color: color as string } : undefined}>{value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {data.investments.mutualFunds.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No mutual funds yet.</Card>}
        </div>
      )}

      {subTab === "stocks" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={activePortfolioId === "all" ? "primary" : "secondary"} onClick={() => setActivePortfolioId("all")}>All</Button>
            {data.investments.stockPortfolios.map((portfolio) => (
              <Button key={portfolio.id} size="sm" variant={activePortfolioId === portfolio.id ? "primary" : "secondary"} onClick={() => setActivePortfolioId(portfolio.id)}>
                {portfolio.name}
              </Button>
            ))}
            <Button size="sm" variant="soft" onClick={() => { setEditingPortfolio(null); setIsPortfolioModalOpen(true); }} icon={<Icon name="plus" size={12} />}>
              Portfolio
            </Button>
          </div>

          {activePortfolioId === "all" ? (
            <div className="space-y-2.5">
              <TotalsCard title="All stock portfolios" totals={stockTotals} />
              {portfolioSummaries.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {portfolioSummaries.map(({ portfolio, totals }) => {
                    const gainLoss = getGainLoss(totals);
                    return (
                      <Card key={portfolio.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold">{portfolio.name}</div>
                            <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">{portfolio.ownerName} / {portfolio.broker}</div>
                          </div>
                          <Badge variant={gainLoss.amount >= 0 ? "success" : "danger"}>{gainLoss.pct >= 0 ? "+" : ""}{gainLoss.pct.toFixed(1)}%</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <StatMini label="Invested" value={compactINR(totals.invested)} />
                          <StatMini label="Current" value={compactINR(totals.current)} />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
              {stockHoldings.map((holding) => {
                const gainLoss = holding.totalCurrentValue - holding.totalInvested;
                const pct = holding.totalInvested > 0 ? (gainLoss / holding.totalInvested) * 100 : 0;
                return (
                  <Card key={holding.name}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold">{holding.name}</div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">{holding.tickers.join(", ")} · {holding.portfolios.join(", ")}</div>
                      </div>
                      <Badge variant={gainLoss >= 0 ? "success" : "danger"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <StatMini label="Qty" value={String(holding.totalQty)} />
                      <StatMini label="Invested" value={compactINR(holding.totalInvested)} />
                      <StatMini label="Current" value={compactINR(holding.totalCurrentValue)} />
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : activePortfolio ? (
            <div className="space-y-2.5">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-[15px] font-semibold">{activePortfolio.name}</div>
                    <div className="text-[11.5px] text-[color:var(--ink-4)]">{activePortfolio.ownerName} · {activePortfolio.broker}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setEditingPortfolio(activePortfolio); setIsPortfolioModalOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleImport(activePortfolio.id, activePortfolio.broker)}>Import CSV</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setEditingItem(null); setIsItemModalOpen(true); }}>Add holding</Button>
                  </div>
                </div>
              </Card>
              <TotalsCard title={`${activePortfolio.name} total`} totals={activePortfolioTotals} />

              {activePortfolio.holdings.map((holding) => {
                const current = holding.quantity * holding.currentPrice;
                const invested = holding.quantity * holding.avgBuyPrice;
                const gainLoss = current - invested;
                const pct = invested > 0 ? (gainLoss / invested) * 100 : 0;
                return (
                  <Card key={holding.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono-num text-[13px] font-semibold">{holding.ticker}</div>
                        <div className="text-[11px] text-[color:var(--ink-4)]">{holding.companyName}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingItem(holding); setIsItemModalOpen(true); }} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05]">
                          <Icon name="pencil" size={14} />
                        </button>
                        <button onClick={() => removeItem(holding.id)} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <StatMini label="Qty x LTP" value={`${holding.quantity} x ${compactINR(holding.currentPrice)}`} />
                      <StatMini label="Current" value={compactINR(current)} />
                      <StatMini label="P&L" value={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`} tone={gainLoss >= 0 ? "success" : "danger"} />
                    </div>
                  </Card>
                );
              })}
              {activePortfolio.holdings.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No holdings in this portfolio yet.</Card>}
            </div>
          ) : (
            <Card className="py-10 text-center text-[color:var(--ink-4)]">Create a stock portfolio to start tracking holdings.</Card>
          )}
        </div>
      )}

      {subTab === "fd" && (
        <div className="space-y-2.5">
          <TotalsCard title="Fixed deposit total" totals={fdTotals} />
          {data.investments.fd.map((fd) => {
            const current = calculateFDValue(fd.principal, fd.interestRate, fd.startDate, fd.maturityDate);
            return (
              <Card key={fd.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-semibold">{fd.bankName}</div>
                    <div className="text-[11px] text-[color:var(--ink-4)]">{fd.startDate} {"->"} {fd.maturityDate}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{fd.interestRate}% p.a.</Badge>
                    <button onClick={() => { setEditingItem(fd); setIsItemModalOpen(true); }} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05]"><Icon name="pencil" size={14} /></button>
                    <button onClick={() => removeItem(fd.id)} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">Principal</div>
                    <div className="font-display text-[20px] font-semibold tabular">{formatCurrency(fd.principal)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">Current</div>
                    <div className="font-mono-num text-[13px] tabular text-[color:var(--ink-2)]">{compactINR(current)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
          {data.investments.fd.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No fixed deposits yet.</Card>}
        </div>
      )}

      {subTab === "rd" && (
        <div className="space-y-2.5">
          <TotalsCard title="Recurring deposit total" totals={rdTotals} />
          {data.investments.rd.map((rd) => {
            const current = calculateRDValue(rd.monthlyDeposit, rd.interestRate, rd.startDate, rd.maturityDate);
            const invested = calculateRDInvested(rd.monthlyDeposit, rd.startDate, rd.maturityDate);
            return (
              <Card key={rd.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13.5px] font-semibold">{rd.bankName}</div>
                    <div className="text-[11px] text-[color:var(--ink-4)]">{rd.startDate} {"->"} {rd.maturityDate}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{rd.interestRate}% p.a.</Badge>
                    <button onClick={() => { setEditingItem(rd); setIsItemModalOpen(true); }} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05]"><Icon name="pencil" size={14} /></button>
                    <button onClick={() => removeItem(rd.id)} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatMini label="Monthly" value={compactINR(rd.monthlyDeposit)} />
                  <StatMini label="Invested" value={compactINR(invested)} />
                  <StatMini label="Current" value={compactINR(current)} />
                </div>
              </Card>
            );
          })}
          {data.investments.rd.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No recurring deposits yet.</Card>}
        </div>
      )}

      <InvestmentItemModal
        open={isItemModalOpen}
        onClose={() => { setIsItemModalOpen(false); setEditingItem(null); }}
        subTab={subTab}
        data={data}
        updateData={updateData}
        editingItem={editingItem}
        activePortfolio={activePortfolio}
        accounts={accounts}
      />

      <PortfolioModal
        open={isPortfolioModalOpen}
        onClose={() => { setIsPortfolioModalOpen(false); setEditingPortfolio(null); }}
        editingPortfolio={editingPortfolio}
        data={data}
        updateData={updateData}
        onSaved={(id) => setActivePortfolioId(id)}
      />
    </div>
  );
}

function TotalsCard({
  title,
  totals,
}: {
  title: string;
  totals: InvestmentTotals;
}) {
  const gainLoss = getGainLoss(totals);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-4)]">{title}</div>
          <div className="mt-1 font-display text-[22px] font-semibold tabular">{formatCurrency(totals.current)}</div>
        </div>
        <Badge variant={gainLoss.amount >= 0 ? "success" : "danger"}>
          {gainLoss.amount >= 0 ? "+" : ""}{compactINR(gainLoss.amount)} ({gainLoss.pct.toFixed(1)}%)
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatMini label="Invested" value={compactINR(totals.invested)} />
        <StatMini label="Current" value={compactINR(totals.current)} />
      </div>
    </Card>
  );
}

function StatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-[12px] bg-[color:var(--bg-3)] px-3 py-2 hairline">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">{label}</div>
      <div className="font-mono-num text-[13px] font-semibold tabular" style={tone ? { color: tone === "success" ? "var(--pos)" : "var(--neg)" } : undefined}>{value}</div>
    </div>
  );
}

function InvestmentItemModal({
  open,
  onClose,
  subTab,
  data,
  updateData,
  editingItem,
  activePortfolio,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  subTab: InvestmentTab;
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
  editingItem: any;
  activePortfolio: StockPortfolio | null;
  accounts: ReturnType<typeof getAllAccounts>;
}) {
  const stockPortfolios = data.investments.stockPortfolios;

  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={editingItem ? "Edit Investment" : "Add Investment"} className="max-w-3xl">
      {subTab === "mf" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const id = editingItem?.id || Date.now().toString();
            const sipAmount = Number(formData.get("sipAmount") || 0);
            const lumpsumAmount = Number(formData.get("lumpsumAmount") || 0);
            const fund: MutualFund = {
              id,
              fundName: String(formData.get("fundName")),
              amc: String(formData.get("amc")),
              category: formData.get("category") as MFCategory,
              currentValue: Number(formData.get("currentValue")),
              lumpsumEntries: lumpsumAmount > 0 ? [{ id: `${id}_lump`, date: String(formData.get("lumpsumDate") || new Date().toISOString().slice(0, 10)), amount: lumpsumAmount }] : [],
              sipDetails: sipAmount > 0 ? {
                monthlyAmount: sipAmount,
                startDate: String(formData.get("sipStartDate") || new Date().toISOString().slice(0, 10)),
                status: "Active",
                fromAccountId: String(formData.get("sipAccountId") || "") || null,
                fromAccountName: accounts.find((account) => account.id === String(formData.get("sipAccountId")) )?.bankName || null,
                paymentMethod: "Net Banking",
              } : undefined,
              createdAt: editingItem?.createdAt || new Date().toISOString(),
            };

            updateData({
              investments: {
                ...data.investments,
                mutualFunds: editingItem
                  ? data.investments.mutualFunds.map((item) => item.id === id ? fund : item)
                  : [...data.investments.mutualFunds, fund],
              },
            });
            onClose();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Fund Name" name="fundName" required defaultValue={editingItem?.fundName} className="md:col-span-2" />
            <Input label="AMC" name="amc" required defaultValue={editingItem?.amc} />
            <Select label="Category" name="category" defaultValue={editingItem?.category || "Equity"}>
              {["Equity", "Debt", "Hybrid", "ELSS", "Index"].map((category) => <option key={category} value={category}>{category}</option>)}
            </Select>
            <Input label="Current Value" name="currentValue" type="number" required defaultValue={editingItem?.currentValue} className="md:col-span-2" />
            <Input label="Lumpsum Amount" name="lumpsumAmount" type="number" defaultValue={editingItem ? editingItem.lumpsumEntries?.reduce((sum: number, entry: any) => sum + entry.amount, 0) : ""} />
            <Input label="Lumpsum Date" name="lumpsumDate" type="date" defaultValue={editingItem?.lumpsumEntries?.[0]?.date || new Date().toISOString().slice(0, 10)} />
            <Input label="SIP Amount" name="sipAmount" type="number" defaultValue={editingItem?.sipDetails?.monthlyAmount || ""} />
            <Input label="SIP Start Date" name="sipStartDate" type="date" defaultValue={editingItem?.sipDetails?.startDate || new Date().toISOString().slice(0, 10)} />
            <Select label="SIP Account" name="sipAccountId" defaultValue={editingItem?.sipDetails?.fromAccountId || accounts[0]?.id || ""} className="md:col-span-2">
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.bankName}</option>)}
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" block>{editingItem ? "Update" : "Add"}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}

      {subTab === "stocks" && stockPortfolios.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const id = editingItem?.id || Date.now().toString();
            const targetPortfolioId = String(formData.get("portfolioId") || activePortfolio?.id || stockPortfolios[0]?.id || "");
            const targetPortfolio = stockPortfolios.find((portfolio) => portfolio.id === targetPortfolioId);
            if (!targetPortfolio) return;
            const quantity = Number(formData.get("quantity"));
            const avgBuyPrice = Number(formData.get("avgBuyPrice"));
            const currentPrice = Number(formData.get("currentPrice"));
            const stock: Stock = {
              id,
              companyName: String(formData.get("companyName")),
              ticker: String(formData.get("ticker")).toUpperCase(),
              quantity,
              avgBuyPrice,
              currentPrice,
            };

            let nextHoldings = editingItem
              ? targetPortfolio.holdings.map((item) => item.id === id ? stock : item)
              : [...targetPortfolio.holdings, stock];

            if (!editingItem) {
              const duplicate = targetPortfolio.holdings.find((item) => item.companyName.toLowerCase() === stock.companyName.toLowerCase());
              if (duplicate) {
                nextHoldings = targetPortfolio.holdings.map((item) =>
                  item.id === duplicate.id
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        avgBuyPrice: calculateWeightedAverage(item.quantity, item.avgBuyPrice, quantity, avgBuyPrice),
                        currentPrice,
                      }
                    : item,
                );
              }
            }

            updateData({
              investments: {
                ...data.investments,
                stockPortfolios: data.investments.stockPortfolios.map((portfolio) =>
                  portfolio.id === targetPortfolio.id ? { ...portfolio, holdings: nextHoldings } : portfolio,
                ),
              },
            });
            onClose();
          }}
          className="space-y-4"
        >
          <div className="rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-sm text-[color:var(--ink-3)] hairline">
            {editingItem
              ? `Editing holding in ${activePortfolio?.name || "portfolio"}`
              : `Add a holding to ${activePortfolio?.name || "one of your portfolios"}`}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!editingItem && (
              <Select label="Portfolio" name="portfolioId" defaultValue={activePortfolio?.id || stockPortfolios[0]?.id || ""} className="md:col-span-2">
                {stockPortfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
              </Select>
            )}
            <Input label="Company Name" name="companyName" required defaultValue={editingItem?.companyName} className="md:col-span-2" />
            <Input label="Ticker" name="ticker" required defaultValue={editingItem?.ticker} />
            <Input label="Quantity" name="quantity" type="number" required defaultValue={editingItem?.quantity} />
            <Input label="Avg Buy Price" name="avgBuyPrice" type="number" required defaultValue={editingItem?.avgBuyPrice} />
            <Input label="Current Price" name="currentPrice" type="number" required defaultValue={editingItem?.currentPrice} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" block>{editingItem ? "Update" : "Add"}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}

      {(subTab === "fd" || subTab === "rd") && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const id = editingItem?.id || Date.now().toString();

            if (subTab === "fd") {
              const fd: FixedDeposit = {
                id,
                bankName: String(formData.get("bankName")),
                principal: Number(formData.get("principal")),
                interestRate: Number(formData.get("interestRate")),
                startDate: String(formData.get("startDate")),
                maturityDate: String(formData.get("maturityDate")),
                fromAccountId: null,
                fromAccountName: null,
                createdAt: editingItem?.createdAt || new Date().toISOString(),
              };
              updateData({
                investments: {
                  ...data.investments,
                  fd: editingItem ? data.investments.fd.map((item) => item.id === id ? fd : item) : [...data.investments.fd, fd],
                },
              });
            } else {
              const accountId = String(formData.get("fromAccountId") || "") || null;
              const rd: RecurringDeposit = {
                id,
                bankName: String(formData.get("bankName")),
                monthlyDeposit: Number(formData.get("monthlyDeposit")),
                interestRate: Number(formData.get("interestRate")),
                startDate: String(formData.get("startDate")),
                maturityDate: String(formData.get("maturityDate")),
                fromAccountId: accountId,
                fromAccountName: accounts.find((account) => account.id === accountId)?.bankName || null,
                paymentMethod: "Net Banking",
                createdAt: editingItem?.createdAt || new Date().toISOString(),
              };
              updateData({
                investments: {
                  ...data.investments,
                  rd: editingItem ? data.investments.rd.map((item) => item.id === id ? rd : item) : [...data.investments.rd, rd],
                },
              });
            }
            onClose();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Bank Name" name="bankName" required defaultValue={editingItem?.bankName} className="md:col-span-2" />
            <Input label={subTab === "fd" ? "Principal" : "Monthly Deposit"} name={subTab === "fd" ? "principal" : "monthlyDeposit"} type="number" required defaultValue={subTab === "fd" ? editingItem?.principal : editingItem?.monthlyDeposit} />
            <Input label="Interest Rate (%)" name="interestRate" type="number" required defaultValue={editingItem?.interestRate} />
            <Input label="Start Date" name="startDate" type="date" required defaultValue={editingItem?.startDate || new Date().toISOString().slice(0, 10)} />
            <Input label="Maturity Date" name="maturityDate" type="date" required defaultValue={editingItem?.maturityDate} />
            {subTab === "rd" && (
              <Select label="From Account" name="fromAccountId" defaultValue={editingItem?.fromAccountId || accounts[0]?.id || ""} className="md:col-span-2">
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.bankName}</option>)}
              </Select>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" block>{editingItem ? "Update" : "Add"}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function PortfolioModal({
  open,
  onClose,
  editingPortfolio,
  data,
  updateData,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editingPortfolio: StockPortfolio | null;
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
  onSaved: (id: string) => void;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} title={editingPortfolio ? "Edit Portfolio" : "Create Portfolio"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const id = editingPortfolio?.id || `portfolio_${Date.now()}`;
          const portfolio: StockPortfolio = {
            id,
            name: String(formData.get("name")),
            ownerName: String(formData.get("ownerName")),
            broker: formData.get("broker") as BrokerType,
            holdings: editingPortfolio?.holdings || [],
          };
          updateData({
            investments: {
              ...data.investments,
              stockPortfolios: editingPortfolio
                ? data.investments.stockPortfolios.map((item) => item.id === id ? portfolio : item)
                : [...data.investments.stockPortfolios, portfolio],
            },
          });
          onSaved(id);
          onClose();
        }}
        className="space-y-4"
      >
        <Input label="Portfolio Name" name="name" required defaultValue={editingPortfolio?.name} />
        <Input label="Owner Name" name="ownerName" required defaultValue={editingPortfolio?.ownerName} />
        <Select label="Broker" name="broker" defaultValue={editingPortfolio?.broker || "Groww"}>
          {["Groww", "Zerodha", "Upstox", "Other"].map((broker) => <option key={broker} value={broker}>{broker}</option>)}
        </Select>
        <div className="flex gap-3 pt-2">
          <Button type="submit" block>{editingPortfolio ? "Update" : "Create"}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
