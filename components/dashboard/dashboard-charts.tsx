"use client";

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
import { formatCurrency } from "@/lib/utils";
import type { CategoryTotal, MonthlyTotal } from "@/types";

function formatMonthShort(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short" });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <p className="chart-tooltip-label">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="opacity-70">{entry.name}:</span>
          <span className="font-semibold">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardCharts({
  monthlyTotals,
  categoryTotals,
}: {
  monthlyTotals: MonthlyTotal[];
  categoryTotals: CategoryTotal[];
}) {
  const barData = monthlyTotals.map((m) => ({
    month: formatMonthShort(m.month),
    Income: m.income,
    Expenses: m.expenses,
  }));

  const pieData = categoryTotals.slice(0, 8).map((c) => ({
    name: c.categoryName,
    value: c.total,
    color: c.color,
  }));

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
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={<ChartTooltip />}
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
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Spending by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              No expense data for this month
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
                    <Tooltip content={<ChartTooltip />} />
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
                      {formatCurrency(entry.value)}
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
