"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { BudgetRule502030Band, BudgetSummary } from "@/types";

type BandKind = "Actual" | "Target" | "Guideline";

const BAR_BLUE = "#3b82f6";
const BAR_GREEN = "#22c55e";
const BAR_RED = "#ef4444";
const BAR_PRIMARY = "var(--color-primary)";

function actualColorFor(
  bucket: "needs" | "wants" | "savings",
  band: BudgetRule502030Band,
): string {
  if (bucket === "savings") {
    return band.guideline > 0 && band.actualTotal >= band.guideline
      ? BAR_GREEN
      : BAR_PRIMARY;
  }
  return band.guideline > 0 && band.actualTotal > band.guideline
    ? BAR_RED
    : BAR_PRIMARY;
}

function buildChartData(band: BudgetRule502030Band) {
  return [
    { kind: "Actual" as const, value: band.actualTotal },
    { kind: "Target" as const, value: band.targetTotal },
    { kind: "Guideline" as const, value: band.guideline },
  ];
}

function BandTooltip({
  active,
  payload,
  homeCurrency,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { kind: BandKind; value: number } }>;
  homeCurrency: SupportedCurrency;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{datum.kind}</p>
      <p className="font-semibold">
        {formatCurrency(datum.value, homeCurrency)}
      </p>
    </div>
  );
}

function BandMiniChart({
  label,
  bucket,
  band,
  homeCurrency,
  height = 140,
  showAxis = true,
}: {
  label: string;
  bucket: "needs" | "wants" | "savings";
  band: BudgetRule502030Band;
  homeCurrency: SupportedCurrency;
  height?: number;
  showAxis?: boolean;
}) {
  const data = buildChartData(band);
  const actualFill = actualColorFor(bucket, band);
  const colorByKind: Record<BandKind, string> = {
    Actual: actualFill,
    Target: BAR_BLUE,
    Guideline: BAR_GREEN,
  };

  const pctGuideline =
    band.guideline > 0
      ? Math.round((band.actualTotal / band.guideline) * 100)
      : 0;

  const isOverGuideline =
    bucket !== "savings" &&
    band.guideline > 0 &&
    band.actualTotal > band.guideline;

  return (
    <div className="space-y-1.5" data-testid={`rule-band-chart-${bucket}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={`text-xs tabular-nums ${
            isOverGuideline
              ? "text-red-600 dark:text-red-400 font-medium"
              : "text-muted-foreground"
          }`}
        >
          {pctGuideline}% of guide
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="20%"
          >
            <XAxis
              dataKey="kind"
              tick={{
                fontSize: 11,
                fill: "var(--color-muted-foreground)",
              }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            {showAxis ? (
              <YAxis
                tickFormatter={(v) =>
                  Number(v) >= 1000
                    ? `${Math.round(Number(v) / 1000)}k`
                    : `${Math.round(Number(v))}`
                }
                tick={{
                  fontSize: 10,
                  fill: "var(--color-muted-foreground)",
                }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
            ) : (
              <YAxis hide />
            )}
            <Tooltip
              content={<BandTooltip homeCurrency={homeCurrency} />}
              cursor={{ fill: "var(--color-accent)" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.kind} fill={colorByKind[d.kind]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {showAxis ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          Actual {formatCurrency(band.actualTotal, homeCurrency)} · Target{" "}
          {formatCurrency(band.targetTotal, homeCurrency)} · Guide{" "}
          {formatCurrency(band.guideline, homeCurrency)}
        </p>
      ) : null}
    </div>
  );
}

function ChartLegend() {
  const items: Array<{ name: string; color: string }> = [
    { name: "Actual", color: BAR_PRIMARY },
    { name: "Target", color: BAR_BLUE },
    { name: "Guideline", color: BAR_GREEN },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: it.color }}
          />
          {it.name}
        </span>
      ))}
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
          <div className="hidden sm:block shrink-0 pt-1">
            <ChartLegend />
          </div>
        </div>
        {summary.implicitSurplusAsSavings > 0 ? (
          <p className="text-xs text-muted-foreground font-normal">
            Savings &ldquo;actual&rdquo; includes{" "}
            {formatCurrency(summary.implicitSurplusAsSavings, homeCurrency)}{" "}
            unspent surplus for this closed month (money left after expenses and
            tracked savings moves).
          </p>
        ) : null}
        <div className="sm:hidden">
          <ChartLegend />
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <BandMiniChart
          label="Needs (~50%)"
          bucket="needs"
          band={r.needs}
          homeCurrency={homeCurrency}
        />
        <BandMiniChart
          label="Wants (~30%)"
          bucket="wants"
          band={r.wants}
          homeCurrency={homeCurrency}
        />
        <BandMiniChart
          label="Savings (~20%)"
          bucket="savings"
          band={r.savings}
          homeCurrency={homeCurrency}
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
      <CardContent className="space-y-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <BandMiniChart
            label="Needs"
            bucket="needs"
            band={r.needs}
            homeCurrency={homeCurrency}
            height={88}
            showAxis={false}
          />
          <BandMiniChart
            label="Wants"
            bucket="wants"
            band={r.wants}
            homeCurrency={homeCurrency}
            height={88}
            showAxis={false}
          />
          <BandMiniChart
            label="Savings"
            bucket="savings"
            band={r.savings}
            homeCurrency={homeCurrency}
            height={88}
            showAxis={false}
          />
        </div>
        <ChartLegend />
      </CardContent>
    </Card>
  );
}
