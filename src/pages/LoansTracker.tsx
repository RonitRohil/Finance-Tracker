import React, { useState } from "react";
import Icon from "../components/Icon";
import { Badge, Button, Card, Input, Modal, Select } from "../components/UI";
import { Loan, LoanType, PortfolioData } from "../types";
import { formatCurrency } from "../lib/utils";

function compactINR(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
}

function Ring({
  value,
  size = 44,
  stroke = 6,
  color = "var(--pos)",
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
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
      <div className="absolute inset-0 flex items-center justify-center font-mono-num text-[10.5px] font-semibold">{Math.round(value * 100)}%</div>
    </div>
  );
}

export default function LoansTracker({
  data,
  updateData,
}: {
  data: PortfolioData;
  updateData: (d: Partial<PortfolioData>) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);

  const totalOutstanding = data.loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0);
  const totalEmi = data.loans.reduce((sum, loan) => sum + loan.emiAmount, 0);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const loan: Loan = {
      id: editingLoan?.id || Date.now().toString(),
      lenderName: String(formData.get("lenderName")),
      loanType: formData.get("loanType") as LoanType,
      principalAmount: Number(formData.get("principalAmount")),
      outstandingBalance: Number(formData.get("outstandingBalance")),
      emiAmount: Number(formData.get("emiAmount")),
      interestRate: Number(formData.get("interestRate")),
      emiDate: Number(formData.get("emiDate")),
      startDate: String(formData.get("startDate")),
      endDate: String(formData.get("endDate")),
    };

    updateData({
      loans: editingLoan ? data.loans.map((item) => item.id === editingLoan.id ? loan : item) : [...data.loans, loan],
    });
    setIsModalOpen(false);
    setEditingLoan(null);
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-8 lg:px-0">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-semibold whitespace-nowrap">Loans</div>
          <div className="truncate text-[11.5px] text-[color:var(--ink-4)]">{data.loans.length} active · EMIs tracked</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setIsModalOpen(true)} icon={<Icon name="plus" size={14} />}>
          Add
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-4)]">Outstanding</div>
          <div className="mt-1 font-display text-[22px] font-semibold tabular text-[color:var(--neg)]">{compactINR(totalOutstanding)}</div>
          <div className="text-[11px] text-[color:var(--ink-4)]">All loans combined</div>
        </Card>
        <Card>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-4)]">Monthly EMI</div>
          <div className="mt-1 font-display text-[22px] font-semibold tabular">{compactINR(totalEmi)}</div>
          <div className="text-[11px] text-[color:var(--ink-4)]">Current monthly obligation</div>
        </Card>
      </div>

      <div className="space-y-2.5">
        {data.loans.map((loan) => {
          const paid = Math.max(0, loan.principalAmount - loan.outstandingBalance);
          const pct = loan.principalAmount > 0 ? paid / loan.principalAmount : 0;
          const typeIcon = {
            Home: "bank",
            Personal: "wallet",
            Vehicle: "credit-card",
            Education: "inbox",
            "Credit Card": "credit-card",
            Other: "credit-card",
          } as const;

          return (
            <Card key={loan.id}>
              <div className="flex items-start gap-3">
                <div
                  className="grid h-11 w-11 place-items-center rounded-[12px]"
                  style={{
                    background: "color-mix(in oklch, var(--neg) 15%, transparent)",
                    color: "var(--neg)",
                    boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--neg) 35%, transparent)",
                  }}
                >
                  <Icon name={typeIcon[loan.loanType] as any} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-[14px] font-semibold">{loan.lenderName}</div>
                    <Badge variant="secondary">{loan.loanType}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[color:var(--ink-4)]">EMI day {loan.emiDate} · {loan.interestRate}% · ends {loan.endDate.slice(0, 7)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Ring value={pct} />
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { setEditingLoan(loan); setIsModalOpen(true); }} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05]">
                      <Icon name="pencil" size={14} />
                    </button>
                    <button onClick={() => updateData({ loans: data.loans.filter((item) => item.id !== loan.id) })} className="grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ink-4)] hover:bg-white/[0.05] hover:text-[color:var(--neg)]">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <StatMini label="Outstanding" value={compactINR(loan.outstandingBalance)} color="var(--neg)" />
                <StatMini label="EMI" value={compactINR(loan.emiAmount)} />
                <StatMini label="Paid" value={compactINR(paid)} color="var(--pos)" />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "linear-gradient(90deg, var(--pos), var(--accent))" }} />
              </div>
            </Card>
          );
        })}
        {data.loans.length === 0 && <Card className="py-10 text-center text-[color:var(--ink-4)]">No loans recorded yet.</Card>}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingLoan(null); }} title={editingLoan ? "Edit Loan" : "Add Loan"}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Lender Name" name="lenderName" required defaultValue={editingLoan?.lenderName} className="md:col-span-2" />
          <Select label="Loan Type" name="loanType" defaultValue={editingLoan?.loanType || "Personal"}>
            {["Home", "Personal", "Vehicle", "Education", "Credit Card", "Other"].map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Input label="Interest Rate (%)" name="interestRate" type="number" required defaultValue={editingLoan?.interestRate} />
          <Input label="Principal Amount" name="principalAmount" type="number" required defaultValue={editingLoan?.principalAmount} />
          <Input label="Outstanding Balance" name="outstandingBalance" type="number" required defaultValue={editingLoan?.outstandingBalance} />
          <Input label="EMI Amount" name="emiAmount" type="number" required defaultValue={editingLoan?.emiAmount} />
          <Input label="EMI Date" name="emiDate" type="number" min={1} max={31} required defaultValue={editingLoan?.emiDate} />
          <Input label="Start Date" name="startDate" type="date" required defaultValue={editingLoan?.startDate} />
          <Input label="End Date" name="endDate" type="date" required defaultValue={editingLoan?.endDate} />
          <div className="flex gap-3 pt-2 md:col-span-2">
            <Button type="submit" block>{editingLoan ? "Update" : "Add"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setIsModalOpen(false); setEditingLoan(null); }}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatMini({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-[12px] bg-[color:var(--bg-3)] px-3 py-2 hairline">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--ink-4)]">{label}</div>
      <div className="font-mono-num text-[13px] font-semibold tabular" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}
