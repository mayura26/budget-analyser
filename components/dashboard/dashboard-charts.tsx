"use client";

import { useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { CategoryTotal, MonthlyTotal } from "@/types";

type PieDatum = {
  name: string;
  value: number;
  color: string;
  /** Present when pie uses net mode; tooltip and legend show signed amounts. */
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
  categoryNetTotals,
  homeCurrency,
}: {
  monthlyTotals: MonthlyTotal[];
  categoryExpenseTotals: CategoryTotal[];
  categoryNetTotals: CategoryTotal[];
  homeCurrency: SupportedCurrency;
}) {
  const [pieUseNet, setPieUseNet] = useState(false);

  const barData = monthlyTotals.map((m) => ({
    month: formatMonthShort(m.month),
    Income: m.income,
    Expenses: m.expenses,
  }));

  const pieData: PieDatum[] = useMemo(() => {
    const source = pieUseNet ? categoryNetTotals : categoryExpenseTotals;
    return source.slice(0, 8).map((c) => ({
      name: c.categoryName,
      value: pieUseNet ? Math.abs(c.total) : c.total,
      color: c.color,
      signedAmount: pieUseNet ? c.total : undefined,
    }));
  }, [pieUseNet, categoryExpenseTotals, categoryNetTotals]);

  const hasBarData = barData.some((d) => d.Income > 0 || d.Expenses > 0);

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
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Donut Chart */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-base font-semibold">
              {pieUseNet ? "Net by Category" : "Spending by Category"}
            </CardTitle>
            <div className="flex items-center gap-3 shrink-0">
              <Label
                htmlFor="dashboard-pie-net-slider"
                className="text-xs text-muted-foreground font-normal whitespace-nowrap"
              >
                Net in pie
              </Label>
              <input
                id="dashboard-pie-net-slider"
                type="range"
                min={0}
                max={1}
                step={1}
                value={pieUseNet ? 1 : 0}
                onChange={(e) => setPieUseNet(Number(e.target.value) === 1)}
                className="w-24 h-2 accent-primary cursor-pointer"
                aria-valuetext={pieUseNet ? "Net amounts" : "Expenses only"}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-normal leading-snug">
            {pieUseNet
              ? "Slice size is the magnitude of net flow (income minus spending) per category."
              : "Outflows only — same as expense totals elsewhere."}
          </p>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              {pieUseNet
                ? "No net activity by category for this month"
                : "No expense data for this month"}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-[140px] h-[140px] sm:w-[180px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={82}
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

              <ul className="flex-1 space-y-1.5 min-w-0">
                {pieData.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-center gap-2 text-sm min-w-0"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: entry.color }}
                    />
                    <span className="truncate text-muted-foreground flex-1">
                      {entry.name}
                    </span>
                    <span className="font-medium tabular-nums shrink-0">
                      {entry.signedAmount !== undefined
                        ? formatSignedCurrency(entry.signedAmount, homeCurrency)
                        : formatCurrency(entry.value, homeCurrency)}
                    </span>
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
