"use client";

import { cn } from "@/lib/utils";

export type BudgetStatus = "under" | "safe" | "caution" | "over";

const SCALE_MAX = 130;
const SAFE_MIN = 95;
const SAFE_MAX = 105;
const CAUTION_MAX = 115;

const safeBandLeft = (SAFE_MIN / SCALE_MAX) * 100;
const safeBandWidth = ((SAFE_MAX - SAFE_MIN) / SCALE_MAX) * 100;
const targetTickLeft = (100 / SCALE_MAX) * 100;

export function getBudgetStatus(
  spent: number,
  target: number,
  variant: "default" | "savings" = "default",
): BudgetStatus {
  if (target <= 0) return "under";
  const pct = (spent / target) * 100;
  if (variant === "savings") {
    return pct >= SAFE_MIN ? "safe" : "over";
  }
  if (pct < SAFE_MIN) return "under";
  if (pct <= SAFE_MAX) return "safe";
  if (pct <= CAUTION_MAX) return "caution";
  return "over";
}

export function statusTextClass(status: BudgetStatus): string {
  switch (status) {
    case "under":
      return "text-muted-foreground";
    case "safe":
      return "text-emerald-600 dark:text-emerald-400";
    case "caution":
      return "text-amber-600 dark:text-amber-400";
    case "over":
      return "text-red-600 dark:text-red-400";
  }
}

function statusFillClass(status: BudgetStatus): string {
  switch (status) {
    case "under":
    case "safe":
      return "bg-emerald-500 dark:bg-emerald-400";
    case "caution":
      return "bg-amber-500 dark:bg-amber-400";
    case "over":
      return "bg-red-500 dark:bg-red-400";
  }
}

export function BudgetProgressBar({
  spent,
  target,
  className,
  variant = "default",
  size = "sm",
}: {
  spent: number;
  target: number;
  className?: string;
  /**
   * Savings goals: beating the target is good (green/emerald); under target is red.
   * Expenses use `default` (over spend is red, on-target green, slight over amber).
   */
  variant?: "default" | "savings";
  /** `lg` is taller — used for parent-group totals. */
  size?: "sm" | "lg";
}) {
  if (target === 0) return null;

  const rawPct = (spent / target) * 100;
  const fillPct = Math.max(0, Math.min(rawPct, SCALE_MAX));
  const fillWidth = (fillPct / SCALE_MAX) * 100;
  const status = getBudgetStatus(spent, target, variant);
  const fillClass = statusFillClass(status);
  const trackHeight = size === "lg" ? "h-3" : "h-2";

  return (
    <div
      className={cn(
        "relative rounded-full bg-muted overflow-hidden",
        trackHeight,
        className,
      )}
    >
      <div
        className="absolute top-0 h-full bg-emerald-500/15 dark:bg-emerald-400/15"
        style={{ left: `${safeBandLeft}%`, width: `${safeBandWidth}%` }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute top-0 left-0 h-full rounded-full transition-all duration-500",
          fillClass,
        )}
        style={{ width: `${fillWidth}%` }}
      />
      <div
        className="absolute top-0 h-full w-px bg-foreground/40"
        style={{ left: `${targetTickLeft}%` }}
        aria-hidden
      />
    </div>
  );
}
