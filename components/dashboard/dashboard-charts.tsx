"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { CategoryTotal, MonthlyTotal } from "@/types";

const UNSPENT_SLICE_COLOR = "#10b981";
const SAVINGS_PIE_COLOR = "#059669";

type PieDatum = {
  name: string;
  value: number;
  color: string;
  /** Unspent slice: show signed +amount in tooltip and legend */
  signedAmount?: number;
};

function formatSignedCurrency(amount: number, currency: SupportedCurrency) {
  const abs = formatCurrency(Math.abs(amount), currency);
  if (amount < 0) return `−${abs}`;
  if (amount > 0) return `+${abs}`;
  return abs;
}

function formatMonthShort(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short" });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload?: PieDatum;
  }>;
  label?: string;
  homeCurrency: SupportedCurrency;
}

function ChartTooltip({ active, payload, label, homeCurrency }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <p className="chart-tooltip-label">{label}</p>}
      {payload.map((entry) => {
        const datum = entry.payload;
        const signed = datum?.signedAmount;
        const text =
          signed !== undefined
            ? formatSignedCurrency(signed, homeCurrency)
            : formatCurrency(entry.value, homeCurrency);
        return (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: entry.color }}
            />
            <span className="opacity-70">{entry.name}:</span>
            <span className="font-semibold">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardCharts({
  monthlyTotals,
  categoryExpenseTotals,
  monthNet,
  monthSavings,
  homeCurrency,
}: {
  monthlyTotals: MonthlyTotal[];
  categoryExpenseTotals: CategoryTotal[];
  monthNet: number;
  monthSavings: number;
  homeCurrency: SupportedCurrency;
}) {
  const [includeNet, setIncludeNet] = useState(false);

  useEffect(() => {
    if (monthNet <= 0) setIncludeNet(false);
  }, [monthNet]);

  const barData = monthlyTotals.map((m) => ({
    month: formatMonthShort(m.month),
    Income: m.income,
    Expenses: m.expenses,
    Savings: Math.max(0, m.income - m.expenses),
  }));

  const includeNetEffective = includeNet && monthNet > 0;

  const pieData: PieDatum[] = useMemo(() => {
    const expenseSlices = categoryExpenseTotals.slice(0, 8).map((c) => ({
      name: c.categoryName,
      value: c.total,
      color: c.color,
    }));

    if (!includeNetEffective) {
      return expenseSlices;
    }

    const unspent: PieDatum = {
      name: "Unspent",
      value: monthNet,
      color: UNSPENT_SLICE_COLOR,
      signedAmount: monthNet,
    };

    if (expenseSlices.length === 0 && monthSavings <= 0) {
      return [unspent];
    }

    const withNet: PieDatum[] = [...expenseSlices];
    if (monthSavings > 0) {
      withNet.push({
        name: "Savings",
        value: monthSavings,
        color: SAVINGS_PIE_COLOR,
      });
    }
    withNet.push(unspent);
    return withNet;
  }, [includeNetEffective, categoryExpenseTotals, monthNet, monthSavings]);

  const hasBarData = barData.some(
    (d) => d.Income > 0 || d.Expenses > 0 || d.Savings > 0,
  );
  const hasPieData = pieData.length > 0;
  const sliderDisabled = monthNet <= 0;

  const pieHelpLong = includeNetEffective
    ? "Top spending categories, savings allocations (when greater than zero), and unspent income (same net as the summary card)."
    : "Outflows only — same as expense totals elsewhere. Turn on Include Net when net is positive to add savings (if any) and unspent income to the chart.";
  const pieHelpShort = includeNetEffective
    ? "Top categories, savings if any, plus remaining net (same as Net on the summary)."
    : "Outflows only — matches expense totals elsewhere.";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Monthly Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasBarData ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              No data yet — import transactions to get started
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={barData}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                barCategoryGap="30%"
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    `${(Number(v) / 1000).toFixed(0)}k ${homeCurrency}`
                  }
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={<ChartTooltip homeCurrency={homeCurrency} />}
                  cursor={{ fill: "var(--color-accent)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.8125rem", paddingTop: "12px" }}
                />
                <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Savings" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Donut Chart */}
      <Card>
        <CardHeader className="space-y-2 sm:space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-base font-semibold">
              {includeNetEffective
                ? "Income allocation"
                : "Spending by Category"}
            </CardTitle>
            <div className="flex items-center gap-3 shrink-0 min-w-0">
              <Label
                htmlFor="dashboard-pie-include-net-slider"
                className="text-xs text-muted-foreground font-normal whitespace-nowrap"
              >
                Include Net
              </Label>
              <Slider
                id="dashboard-pie-include-net-slider"
                className="w-28"
                min={0}
                max={1}
                step={1}
                disabled={sliderDisabled}
                value={[includeNet && !sliderDisabled ? 1 : 0]}
                onValueChange={(v) => setIncludeNet(v[0] === 1)}
                aria-label="Include Net"
              />
            </div>
          </div>
          <div className="flex items-start gap-2 sm:block">
            <p className="text-xs text-muted-foreground font-normal leading-snug flex-1 min-w-0 sm:hidden">
              {pieHelpShort}
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground sm:hidden"
                  aria-label="Full chart explanation"
                >
                  <CircleHelp className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(100vw-2rem,18rem)] text-xs leading-snug"
              >
                {pieHelpLong}
              </PopoverContent>
            </Popover>
          </div>
          <p className="hidden sm:block text-xs text-muted-foreground font-normal leading-snug">
            {pieHelpLong}
          </p>
        </CardHeader>
        <CardContent>
          {!hasPieData ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              No expense data for this month
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="shrink-0 w-[160px] h-[160px] sm:w-[180px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="42%"
                      outerRadius="68%"
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}-${entry.color}`}
                          fill={entry.color}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip homeCurrency={homeCurrency} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="w-full sm:flex-1 space-y-2 sm:space-y-1.5 min-w-0">
                {pieData.map((entry) => (
                  <li key={entry.name} className="flex gap-2 text-sm min-w-0">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: entry.color }}
                    />
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                      <span className="text-muted-foreground wrap-break-word leading-snug">
                        {entry.name}
                      </span>
                      <span className="font-medium tabular-nums shrink-0 sm:text-right">
                        {entry.signedAmount !== undefined
                          ? formatSignedCurrency(
                              entry.signedAmount,
                              homeCurrency,
                            )
                          : formatCurrency(entry.value, homeCurrency)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
