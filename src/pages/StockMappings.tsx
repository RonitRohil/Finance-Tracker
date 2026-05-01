import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Badge, Button, Card, Input } from "../components/UI";
import { PortfolioData, StockPortfolio } from "../types";
import { formatCurrency, getCombinedStockHoldings } from "../lib/utils";
import {
  addCustomMapping,
  getCustomMappings,
  getStockMappings,
  normalizeStockName,
  removeCustomMapping,
} from "../utils/stockNormalizer";

type StockAliasEntry = {
  portfolio: string;
  rawName: string;
  normalizedName: string;
  ticker: string;
  currentValue: number;
};

type StockAliasGroup = {
  key: string;
  ticker: string;
  primaryLabel: string;
  isMapped: boolean;
  entries: StockAliasEntry[];
  totalCurrentValue: number;
};

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  return `Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

export default function StockMappings({
  data,
  updateData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const [mappingTicker, setMappingTicker] = useState("");
  const [mappingName, setMappingName] = useState("");
  const [active, setActive] = useState<string>("");
  const customMappings = useMemo(() => getCustomMappings(), [data]);
  const view = useMemo(() => buildStockMappingView(data, customMappings), [data, customMappings]);
  const activeGroup = view.aliasGroups.find((group) => group.key === active) || view.aliasGroups[0] || null;

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[20px] font-semibold">Stock Mappings</div>
          <div className="text-[11.5px] text-[color:var(--ink-4)]">Reconcile aliases across brokers</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => {
          if (activeGroup?.ticker) {
            setMappingTicker(activeGroup.ticker);
            setMappingName(activeGroup.primaryLabel);
          }
        }} icon={<Icon name="sliders" size={14} />}>
          Auto-match
        </Button>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[12px]" style={{ background: "color-mix(in oklch, var(--info) 18%, transparent)", color: "var(--info)" }}>
            <Icon name="info" size={16} />
          </div>
          <div className="text-[12px] text-[color:var(--ink-2)] pretty">
            Brokers export the same stock under different names. Map aliases to a canonical ticker so portfolio totals align.
          </div>
        </div>
      </Card>

      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!mappingTicker.trim() || !mappingName.trim()) return;
            addCustomMapping(mappingTicker, mappingName);
            setMappingTicker("");
            setMappingName("");
            updateData({ settings: { ...data.settings } });
          }}
          className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_auto]"
        >
          <Input label="Ticker" value={mappingTicker} onChange={(event) => setMappingTicker(event.target.value.toUpperCase())} placeholder="INFY" />
          <Input label="Canonical name" value={mappingName} onChange={(event) => setMappingName(event.target.value)} placeholder="Infosys Limited" />
          <Button type="submit" className="mt-auto" icon={<Icon name="plus" size={14} />}>Add mapping</Button>
        </form>
      </Card>

      <div>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">Alias groups</div>
        <div className="space-y-2">
          {view.aliasGroups.map((group) => {
            const selected = activeGroup?.key === group.key;
            return (
              <Card key={group.key} padded={false} onClick={() => setActive(group.key)}>
                <div className="flex items-center gap-3 p-4">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-[12px] font-mono-num text-[11px] font-semibold"
                    style={{
                      background: selected ? "color-mix(in oklch, var(--accent) 18%, transparent)" : "var(--bg-3)",
                      color: selected ? "var(--accent)" : "var(--ink-2)",
                      boxShadow: selected ? "inset 0 0 0 1px color-mix(in oklch, var(--accent) 50%, transparent)" : "inset 0 0 0 1px var(--line)",
                    }}
                  >
                    {group.ticker || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13.5px] font-semibold">{group.primaryLabel}</div>
                      <Badge variant={group.isMapped ? "success" : "warning"}>{group.isMapped ? "Grouped" : "Review"}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">{group.entries.length} aliases · {compactINR(group.totalCurrentValue)}</div>
                  </div>
                  <Icon name="chev-right" size={16} className="text-[color:var(--ink-4)]" />
                </div>
              </Card>
            );
          })}
          {view.aliasGroups.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No alias groups found yet.</Card>}
        </div>
      </div>

      {activeGroup && (
        <div>
          <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">{activeGroup.primaryLabel} · aliases</div>
          <Card padded={false}>
            {activeGroup.entries.map((entry, index) => (
              <div key={`${entry.portfolio}-${entry.rawName}`} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-white/[0.05]" : ""}`}>
                <div className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono-num text-[13px]">{entry.rawName}</div>
                  <div className="text-[11px] text-[color:var(--ink-4)]">{entry.portfolio}</div>
                </div>
                {entry.ticker && <Badge variant="secondary">{entry.ticker}</Badge>}
              </div>
            ))}
          </Card>
        </div>
      )}

      <div>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">Grouped stocks</div>
        <div className="space-y-2">
          {view.groupedStocks.slice(0, 8).map((group) => (
            <Card key={group.name}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{group.name}</div>
                  <div className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">{group.portfolios.join(", ")}</div>
                </div>
                <Badge variant={group.gainLoss >= 0 ? "success" : "danger"}>{group.gainLoss >= 0 ? "+" : ""}{compactINR(group.gainLoss)}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat label="Qty" value={String(group.totalQty)} />
                <MiniStat label="Invested" value={compactINR(group.totalInvested)} />
                <MiniStat label="Current" value={compactINR(group.totalCurrentValue)} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-4)]">Saved mappings</div>
        <div className="space-y-2">
          {Object.entries(getStockMappings()).slice(0, 12).map(([ticker, companyName]) => {
            const isCustom = ticker in customMappings;
            return (
              <Card key={ticker} padded={false}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[color:var(--bg-3)] font-mono-num text-[11px] font-semibold hairline">
                    {ticker}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{companyName}</div>
                    <div className="text-[11px] text-[color:var(--ink-4)]">{isCustom ? "Custom mapping" : "Built-in mapping"}</div>
                  </div>
                  {isCustom ? (
                    <button
                      onClick={() => {
                        removeCustomMapping(ticker);
                        updateData({ settings: { ...data.settings } });
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  ) : (
                    <Badge variant="secondary">Protected</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[color:var(--bg-3)] px-3 py-2 hairline">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">{label}</div>
      <div className="font-mono-num text-[13px] font-semibold">{value}</div>
    </div>
  );
}

function buildStockMappingView(data: PortfolioData, customMappings: Record<string, string>) {
  const aliasGroups = new Map<string, StockAliasGroup>();

  const rawHoldings = data.investments.stockPortfolios.flatMap((portfolio: StockPortfolio) =>
    portfolio.holdings.map((holding) => ({
      portfolioId: portfolio.id,
      portfolioLabel: `${portfolio.name} / ${portfolio.broker}`,
      rawName: holding.companyName.trim(),
      normalizedName: normalizeStockName(holding.companyName),
      ticker: holding.ticker?.trim().toUpperCase() || "",
      currentValue: holding.quantity * holding.currentPrice,
    })),
  );

  rawHoldings.forEach((holding) => {
    const key = holding.ticker || holding.normalizedName.toLowerCase();
    const existing = aliasGroups.get(key);
    const entry: StockAliasEntry = {
      portfolio: holding.portfolioLabel,
      rawName: holding.rawName,
      normalizedName: holding.normalizedName,
      ticker: holding.ticker,
      currentValue: holding.currentValue,
    };

    if (existing) {
      existing.entries.push(entry);
      existing.totalCurrentValue += holding.currentValue;
      return;
    }

    aliasGroups.set(key, {
      key,
      ticker: holding.ticker,
      primaryLabel: normalizeStockName(holding.ticker || holding.rawName),
      isMapped: Boolean(holding.ticker) && (holding.ticker in customMappings || holding.ticker in getStockMappings()),
      entries: [entry],
      totalCurrentValue: holding.currentValue,
    });
  });

  const groupedStocks = getCombinedStockHoldings(data).map((group) => ({
    ...group,
    gainLoss: group.totalCurrentValue - group.totalInvested,
  }));

  return {
    aliasGroups: Array.from(aliasGroups.values())
      .filter((group) => new Set(group.entries.map((entry) => entry.rawName.toLowerCase())).size > 1 || new Set(group.entries.map((entry) => entry.portfolio)).size > 1)
      .sort((a, b) => b.totalCurrentValue - a.totalCurrentValue),
    groupedStocks,
  };
}
