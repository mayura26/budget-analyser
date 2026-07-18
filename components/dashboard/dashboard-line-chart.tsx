"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { DailyNeedsWants } from "@/types";

const INCOME_COLOR = "#22c55e";
const NEEDS_COLOR = "#3b82f6";
const WANTS_COLOR = "#f97316";
const EXPENSE_GUIDE_COLOR = "#ef4444";

function ChartTooltip({
  active,
  payload,
  label,
  homeCurrency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number;
  homeCurrency: SupportedCurrency;
}) {
  if (!active || !payload?.length) return null;
  const byName = (name: string) =>
    payload.find((p) => p.name === name)?.value ?? 0;
  const needs = byName("Needs");
  const wants = byName("Wants");
  const income = byName("Income");

  const rows = [
    { name: "Needs", value: needs, color: NEEDS_COLOR },
    { name: "Wants", value: wants, color: WANTS_COLOR },
    { name: "Expenses", value: needs + wants, color: EXPENSE_GUIDE_COLOR },
    { name: "Income", value: income, color: INCOME_COLOR },
  ];

  return (
    <div className="chart-tooltip">
      {label !== undefined && (
        <p className="chart-tooltip-label">Day {label}</p>
      )}
      {rows.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="opacity-70">{entry.name}:</span>
          <span className="font-semibold">
            {formatCurrency(entry.value, homeCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardLineChart({
  daily,
  homeCurrency,
  incomeTarget,
  needsTarget,
  wantsTarget,
}: {
  daily: DailyNeedsWants[];
  homeCurrency: SupportedCurrency;
  incomeTarget?: number;
  needsTarget?: number;
  wantsTarget?: number;
}) {
  const chartData = daily.map((d) => ({
    day: d.day,
    Income: d.income,
    Needs: d.needs,
    Wants: d.wants,
  }));

  const hasData = chartData.some(
    (d) => (d.Income ?? 0) > 0 || (d.Needs ?? 0) > 0 || (d.Wants ?? 0) > 0,
  );
  // Needs + Wants are both expenses, so their targets combine into one guide line.
  const expenseTarget = (needsTarget ?? 0) + (wantsTarget ?? 0);
  const hasTargets = (incomeTarget ?? 0) > 0 || expenseTarget > 0;
  const showChart = hasData || hasTargets;

  const maxDataValue = chartData.reduce((max, d) => {
    const stackedExpense = (d.Needs ?? 0) + (d.Wants ?? 0);
    return Math.max(max, d.Income ?? 0, stackedExpense);
  }, 0);
  const maxTargetValue = Math.max(incomeTarget ?? 0, expenseTarget);
  const yMax = Math.max(maxDataValue, maxTargetValue);
  const yDomainMax = yMax > 0 ? Math.ceil((yMax * 1.1) / 1000) * 1000 : "auto";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Expenses vs Income
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Needs and Wants stacked as total spend, tracked against income.
          Cumulative through the selected month.
        </p>
      </CardHeader>
      <CardContent>
        {!showChart ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            No data for this month yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
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
                domain={[0, yDomainMax]}
              />
              <Tooltip
                content={<ChartTooltip homeCurrency={homeCurrency} />}
                cursor={{ stroke: "var(--color-border)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "0.8125rem", paddingTop: "12px" }}
              />
              {incomeTarget !== undefined && incomeTarget > 0 ? (
                <ReferenceLine
                  y={incomeTarget}
                  stroke={INCOME_COLOR}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "Income target",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: INCOME_COLOR,
                  }}
                />
              ) : null}
              {expenseTarget > 0 ? (
                <ReferenceLine
                  y={expenseTarget}
                  stroke={EXPENSE_GUIDE_COLOR}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "Expense guide",
                    position: "insideBottomLeft",
                    fontSize: 10,
                    fill: EXPENSE_GUIDE_COLOR,
                  }}
                />
              ) : null}
              {/* Needs + Wants stacked = total expenses */}
              <Area
                type="monotone"
                dataKey="Needs"
                stackId="expenses"
                stroke={NEEDS_COLOR}
                strokeWidth={1.5}
                fill={NEEDS_COLOR}
                fillOpacity={0.35}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="Wants"
                stackId="expenses"
                stroke={WANTS_COLOR}
                strokeWidth={1.5}
                fill={WANTS_COLOR}
                fillOpacity={0.35}
                activeDot={{ r: 4 }}
              />
              {/* Income drawn on top so total spend reads against it */}
              <Line
                type="monotone"
                dataKey="Income"
                stroke={INCOME_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
