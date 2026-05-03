"use client";

import { cn } from "@/lib/utils";

export function BudgetProgressBar({
  spent,
  target,
  className,
  /** Surplus-style: actual above target uses green tones (beat plan), not red. */
  variant = "default",
}: {
  spent: number;
  target: number;
  className?: string;
  variant?: "default" | "surplus";
}) {
  if (target === 0) return null;

  const pct = Math.min((spent / target) * 100, 100);
  const overBudget = spent > target;
  const overPct = overBudget
    ? Math.min(((spent - target) / target) * 100, 100)
    : 0;

  let barColor: string;
  if (overBudget && variant === "default") {
    barColor = "bg-red-500 dark:bg-red-400";
  } else if (overBudget && variant === "surplus") {
    barColor = "bg-emerald-500 dark:bg-emerald-400";
  } else if (pct >= 75) {
    barColor = "bg-amber-500 dark:bg-amber-400";
  } else {
    barColor = "bg-green-500 dark:bg-green-400";
  }

  const overLayClass =
    variant === "surplus"
      ? "bg-emerald-500/35 dark:bg-emerald-400/35"
      : "bg-red-500/30 dark:bg-red-400/30";

  return (
    <div
      className={cn(
        "relative h-2 rounded-full bg-muted overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          barColor,
        )}
        style={{ width: `${pct}%` }}
      />
      {overBudget && (
        <div
          className={cn(
            "absolute top-0 right-0 h-full rounded-r-full",
            overLayClass,
          )}
          style={{ width: `${overPct}%` }}
        />
      )}
    </div>
  );
}
