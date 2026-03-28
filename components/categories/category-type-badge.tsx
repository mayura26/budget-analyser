import { cn } from "@/lib/utils";

const STYLES: Record<"income" | "expense" | "transfer", string> = {
  income:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/15",
  expense:
    "border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100 dark:bg-rose-500/15",
  transfer:
    "border-slate-400/50 bg-slate-500/10 text-slate-700 dark:text-slate-200 dark:border-slate-500/40 border-dashed",
};

const LABELS: Record<"income" | "expense" | "transfer", string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

export function CategoryTypeBadge({
  type,
  className,
}: {
  type: "income" | "expense" | "transfer";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[type],
        className
      )}
    >
      {LABELS[type]}
    </span>
  );
}
