"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

function LineTooltip({
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
  return (
    <div className="chart-tooltip">
      {label !== undefined && (
        <p className="chart-tooltip-label">Day {label}</p>
      )}
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
  const lineData = daily.map((d) => ({
    day: d.day,
    Income: d.income,
    Needs: d.needs,
    Wants: d.wants,
  }));

  const hasData = lineData.some(
    (d) => (d.Income ?? 0) > 0 || (d.Needs ?? 0) > 0 || (d.Wants ?? 0) > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Needs, Wants &amp; Income
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Cumulative through the selected month.
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            No data for this month yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={lineData}
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
              />
              <Tooltip
                content={<LineTooltip homeCurrency={homeCurrency} />}
                cursor={{ stroke: "var(--color-border)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "0.8125rem", paddingTop: "12px" }}
              />
              {incomeTarget !== undefined && incomeTarget > 0 ? (
                <ReferenceLine
                  y={incomeTarget}
                  stroke="#22c55e"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "Income target",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#22c55e",
                  }}
                />
              ) : null}
              {needsTarget !== undefined && needsTarget > 0 ? (
                <ReferenceLine
                  y={needsTarget}
                  stroke="#3b82f6"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "Needs target",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#3b82f6",
                  }}
                />
              ) : null}
              {wantsTarget !== undefined && wantsTarget > 0 ? (
                <ReferenceLine
                  y={wantsTarget}
                  stroke="#f97316"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "Wants target",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#f97316",
                  }}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="Income"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Needs"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Wants"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
