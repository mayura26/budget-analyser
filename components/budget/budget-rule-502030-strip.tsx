"use client";

import Link from "next/link";
import {
  type BudgetStatus,
  statusTextClass,
} from "@/components/budget/budget-progress-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency } from "@/lib/utils";
import type { BudgetRule502030Band, BudgetSummary } from "@/types";

const SCALE = 130;
const GUIDE_LEFT_PCT = (100 / SCALE) * 100; // ~76.9%

function getBand502030Status(
  bucket: "needs" | "wants" | "savings",
  band: BudgetRule502030Band,
): BudgetStatus {
  if (band.guideline <= 0) return "under";
  if (bucket === "savings") {
    if (band.actualTotal >= band.guideline) return "safe";
    if (band.targetTotal > 0 && band.actualTotal >= band.targetTotal)
      return "caution";
    return "over";
  }
  if (band.targetTotal <= 0 || band.actualTotal <= band.targetTotal)
    return "under";
  if (band.actualTotal <= band.guideline) return "caution";
  return "over";
}

function fillColorClass(status: BudgetStatus): string {
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

function BandHorizontalBar({
  label,
  bucket,
  band,
  homeCurrency,
  size = "lg",
}: {
  label: string;
  bucket: "needs" | "wants" | "savings";
  band: BudgetRule502030Band;
  homeCurrency: SupportedCurrency;
  size?: "sm" | "lg";
}) {
  const status = getBand502030Status(bucket, band);
  const fillPct =
    band.guideline > 0
      ? (Math.max(
          0,
          Math.min((band.actualTotal / band.guideline) * 100, SCALE),
        ) /
          SCALE) *
        100
      : 0;

  const targetRawPct =
    band.targetTotal > 0 && band.guideline > 0
      ? (Math.min((band.targetTotal / band.guideline) * 100, SCALE) / SCALE) *
        100
      : null;
  const showTargetTick =
    targetRawPct !== null &&
    Math.abs((band.targetTotal - band.guideline) / band.guideline) > 0.05;

  const pct =
    band.guideline > 0
      ? Math.round((band.actualTotal / band.guideline) * 100)
      : 0;

  const barH = size === "sm" ? 12 : 16;

  return (
    <div data-testid={`rule-band-chart-${bucket}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            statusTextClass(status),
          )}
        >
          {pct}% of guide
        </span>
      </div>

      {/* Target marker — red chevron + label ABOVE the bar */}
      <div className="relative mb-0.5" style={{ height: 20 }}>
        {showTargetTick && targetRawPct !== null && (
          <>
            <span
              className="absolute text-[10px] font-semibold text-red-500 dark:text-red-400 -translate-x-1/2 top-0 leading-none whitespace-nowrap"
              style={{ left: `${targetRawPct}%` }}
            >
              Target
            </span>
            <svg
              className="absolute -translate-x-1/2 bottom-0 text-red-500 dark:text-red-400"
              style={{ left: `${targetRawPct}%` }}
              width="12"
              height="8"
              viewBox="0 0 12 8"
              aria-hidden
            >
              <title>Target marker</title>
              <path d="M0 0L6 8L12 0Z" fill="currentColor" />
            </svg>
          </>
        )}
      </div>

      <div className="relative" style={{ height: barH }}>
        {/* track */}
        <div className="absolute inset-0 bg-muted rounded-full" />
        {/* fill */}
        <div
          className={cn(
            "absolute top-0 left-0 h-full rounded-full transition-all duration-500",
            fillColorClass(status),
          )}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Guide marker — blue chevron + label BELOW the bar */}
      <div className="relative mt-0.5" style={{ height: 20 }}>
        <svg
          className="absolute -translate-x-1/2 top-0 text-blue-500 dark:text-blue-400"
          style={{ left: `${GUIDE_LEFT_PCT}%` }}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          aria-hidden
        >
          <title>Guide marker</title>
          <path d="M0 8L6 0L12 8Z" fill="currentColor" />
        </svg>
        <span
          className="absolute text-[10px] font-semibold text-blue-500 dark:text-blue-400 -translate-x-1/2 bottom-0 leading-none whitespace-nowrap"
          style={{ left: `${GUIDE_LEFT_PCT}%` }}
        >
          Guide
        </span>
      </div>

      {/* numbers row — full strip only */}
      {size === "lg" && (
        <p className="text-xs tabular-nums text-muted-foreground mt-1">
          {formatCurrency(band.actualTotal, homeCurrency)} actual &middot;{" "}
          {band.targetTotal > 0
            ? `${formatCurrency(band.targetTotal, homeCurrency)} budget · `
            : ""}
          {formatCurrency(band.guideline, homeCurrency)} guide
        </p>
      )}
    </div>
  );
}

export function BudgetRule502030Strip({
  summary,
  homeCurrency,
}: {
  summary: BudgetSummary;
  homeCurrency: SupportedCurrency;
}) {
  const { rule502030: r, incomeBasis, expectedIncome } = summary;
  const basisNote =
    incomeBasis > expectedIncome
      ? "Uses max(scheduled income, realised income) for guideline percentages."
      : "Guidelines use scheduled income; realised income was lower this month.";

  return (
    <Card>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base font-semibold">
              50 / 30 / 20 guideline
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Income basis {formatCurrency(incomeBasis, homeCurrency)} &mdash;{" "}
              {basisNote}
            </p>
          </div>
        </div>
        {summary.implicitSurplusAsSavings > 0 ? (
          <p className="text-xs text-muted-foreground font-normal">
            Savings &ldquo;actual&rdquo; includes{" "}
            {formatCurrency(summary.implicitSurplusAsSavings, homeCurrency)}{" "}
            unallocated surplus (income left after expenses and tracked savings
            moves).
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <BandHorizontalBar
          label="Needs (~50%)"
          bucket="needs"
          band={r.needs}
          homeCurrency={homeCurrency}
          size="lg"
        />
        <BandHorizontalBar
          label="Wants (~30%)"
          bucket="wants"
          band={r.wants}
          homeCurrency={homeCurrency}
          size="lg"
        />
        <BandHorizontalBar
          label="Savings (~20%)"
          bucket="savings"
          band={r.savings}
          homeCurrency={homeCurrency}
          size="lg"
        />
      </CardContent>
    </Card>
  );
}

export function BudgetRule502030Compact({
  summary,
  homeCurrency,
  href,
}: {
  summary: BudgetSummary;
  homeCurrency: SupportedCurrency;
  href?: string;
}) {
  const { rule502030: r } = summary;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">
          50 / 30 / 20 guideline
        </CardTitle>
        {href ? (
          <Link href={href} className="text-xs text-primary hover:underline">
            Open budget
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <BandHorizontalBar
          label="Needs"
          bucket="needs"
          band={r.needs}
          homeCurrency={homeCurrency}
          size="sm"
        />
        <BandHorizontalBar
          label="Wants"
          bucket="wants"
          band={r.wants}
          homeCurrency={homeCurrency}
          size="sm"
        />
        <BandHorizontalBar
          label="Savings"
          bucket="savings"
          band={r.savings}
          homeCurrency={homeCurrency}
          size="sm"
        />
      </CardContent>
    </Card>
  );
}
