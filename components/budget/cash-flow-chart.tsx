"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { BalancePoint } from "@/types";

interface Props {
  points: BalancePoint[];
  currentBalance: number;
  homeCurrency: SupportedCurrency;
}

const HORIZONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
] as const;

function formatCompact(v: number, homeCurrency: SupportedCurrency) {
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toFixed(1)}k ${homeCurrency}`;
  }
  return formatCurrency(v, homeCurrency);
}

interface TooltipPayload {
  payload: BalancePoint;
}

function CustomTooltip({
  active,
  payload,
  label,
  homeCurrency,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  homeCurrency: SupportedCurrency;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md space-y-1">
      <p className="font-semibold">{label}</p>
      <p>
        Balance:{" "}
        <span className={d.balance >= 0 ? "text-green-600" : "text-red-600"}>
          {formatCurrency(d.balance, homeCurrency)}
        </span>
      </p>
      {d.dayIncome > 0 && (
        <p className="text-green-600">
          +{formatCurrency(d.dayIncome, homeCurrency)}
        </p>
      )}
      {d.dayExpense > 0 && (
        <p className="text-red-600">
          -{formatCurrency(d.dayExpense, homeCurrency)}
        </p>
      )}
    </div>
  );
}

export function CashFlowChart({ points, currentBalance, homeCurrency }: Props) {
  const [horizon, setHorizon] = useState(30);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visible = points.slice(0, horizon);
  // Show every ~7th x-axis tick to avoid crowding
  const tickInterval = Math.max(1, Math.floor(visible.length / 10));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Starting balance:{" "}
            <span
              className={
                currentBalance >= 0 ? "text-green-600" : "text-red-600"
              }
            >
              {formatCurrency(currentBalance, homeCurrency)}
            </span>
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {HORIZONS.map((h) => (
            <Button
              key={h.value}
              size="sm"
              variant={horizon === h.value ? "default" : "outline"}
              onClick={() => setHorizon(h.value)}
            >
              {h.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="w-full h-48 sm:h-80">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={visible}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id="balanceGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="negativeGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval={tickInterval}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(v) => formatCompact(Number(v), homeCurrency)}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip
                content={<CustomTooltip homeCurrency={homeCurrency} />}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#22c55e"
                fill="url(#balanceGradient)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
