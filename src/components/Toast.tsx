import React, { useCallback, useRef, useState } from "react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastState {
  toasts: ToastItem[];
  toast: (message: string, variant?: ToastVariant) => void;
}

export function useToastState(): ToastState {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = counter.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  return { toasts, toast };
}

const VARIANT_COLOR: Record<ToastVariant, string> = {
  success: "var(--pos)",
  error: "var(--neg)",
  info: "var(--accent)",
};

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex min-w-[260px] max-w-sm items-center gap-3 rounded-[14px] bg-[color:var(--bg-3)] px-4 py-3 text-[13px] shadow-2xl fade-in hairline"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: VARIANT_COLOR[t.variant] }}
          />
          <span className="text-[color:var(--ink)]">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
