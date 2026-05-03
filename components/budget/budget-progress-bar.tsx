"use client";

import { cn } from "@/lib/utils";

export function BudgetProgressBar({
  spent,
  target,
  className,
  /**
   * Savings goals: beating the target is good (green/emerald); under target is red.
   * Expenses use `default` (over spend is red).
   */
  variant = "default",
}: {
  spent: number;
  target: number;
  className?: string;
  variant?: "default" | "savings";
}) {
  if (target === 0) return null;

  const pct = Math.min((spent / target) * 100, 100);
  const overTarget = spent > target;
  const overPct = overTarget
    ? Math.min(((spent - target) / target) * 100, 100)
    : 0;

  let barColor: string;
  let overLayClass: string | null = null;

  if (variant === "savings") {
    if (overTarget) {
      barColor = "bg-emerald-500 dark:bg-emerald-400";
      overLayClass = "bg-emerald-500/35 dark:bg-emerald-400/35";
    } else if (spent < target) {
      barColor = "bg-red-500 dark:bg-red-400";
    } else {
      barColor = "bg-green-500 dark:bg-green-400";
    }
  } else if (overTarget) {
    barColor = "bg-red-500 dark:bg-red-400";
    overLayClass = "bg-red-500/30 dark:bg-red-400/30";
  } else if (pct >= 75) {
    barColor = "bg-amber-500 dark:bg-amber-400";
  } else {
    barColor = "bg-green-500 dark:bg-green-400";
  }

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
      {overTarget && overLayClass ? (
        <div
          className={cn(
            "absolute top-0 right-0 h-full rounded-r-full",
            overLayClass,
          )}
          style={{ width: `${overPct}%` }}
        />
      ) : null}
    </div>
  );
}
