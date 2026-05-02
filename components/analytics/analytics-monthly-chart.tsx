"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { MonthlyTotal } from "@/types";

function formatMonthShort(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short" });
}

function MonthlyTooltip({
  active,
  payload,
  label,
  homeCurrency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  homeCurrency: SupportedCurrency;
}) {
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
          <span className="font-semibold">
            {formatCurrency(entry.value, homeCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsMonthlyChart({
  monthly,
  homeCurrency,
}: {
  monthly: MonthlyTotal[];
  homeCurrency: SupportedCurrency;
}) {
  const barData = monthly.map((m) => ({
    month: formatMonthShort(m.month),
    Income: m.income,
    Expenses: m.expenses,
    Savings: m.savings,
  }));

  const hasBarData = barData.some(
    (d) => d.Income > 0 || d.Expenses > 0 || d.Savings > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Cashflow by month
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Income, expenses (needs &amp; wants net), and savings allocations per
          calendar month.
        </p>
      </CardHeader>
      <CardContent>
        {!hasBarData ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            No data in this period
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
                content={<MonthlyTooltip homeCurrency={homeCurrency} />}
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
  );
}
