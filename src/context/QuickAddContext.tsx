import { createContext, useContext } from "react";
import { PaymentMethod } from "../types";

export interface QuickAddPrefill {
  kind: "expense" | "income" | "transfer";
  amount?: string;
  category?: string;
  /** fromAccountId for expense/transfer; toAccountId for income */
  accountId?: string | null;
  /** Only for transfer — the destination account */
  toAccountId?: string | null;
  method?: PaymentMethod;
  note?: string;
  source?: string;
}

interface QuickAddContextValue {
  openQuickAdd: (prefill?: QuickAddPrefill) => void;
}

export const QuickAddContext = createContext<QuickAddContextValue>({ openQuickAdd: () => {} });

export const useQuickAdd = () => useContext(QuickAddContext);
