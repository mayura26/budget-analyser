"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";

// Semantic flow colors — mirror the hex literals used across the dashboard charts.
// Outflows (spent) use the cool/warm spend hues; savings + net (kept) use greens.
const COLORS = {
  income: "#22c55e", // green — the source
  needs: "#3b82f6", // blue
  wants: "#f97316", // orange
  other: "#94a3b8", // slate — expenses with no 50/30/20 bucket
  savings: "#059669", // emerald — kept
  net: "#14b8a6", // teal — leftover, kept
  shortfall: "#ef4444", // red — overspend
} as const;

type FlowNode = {
  key: string;
  label: string;
  value: number;
  color: string;
};

const BAR_W = 10;
const LEFT_X = 5; // source bar sits flush left — income lives in the header
const RIGHT_LABEL_W = 100;
const TOP_PAD = 8;
const BOT_PAD = 8;
const NODE_GAP = 1.5;
const MIN_ROW = 30; // min vertical room per label so small slices stay legible

/** Cubic-bezier flow ribbon between a left slice and a right node of equal height. */
function ribbonPath(
  xL: number,
  yL: number,
  xR: number,
  yR: number,
  h: number,
): string {
  const c = (xL + xR) / 2;
  return (
    `M${xL},${yL} C${c},${yL} ${c},${yR} ${xR},${yR} ` +
    `L${xR},${yR + h} C${c},${yR + h} ${c},${yL + h} ${xL},${yL + h} Z`
  );
}

export function MoneyFlowSankey({
  income,
  needs,
  wants,
  other,
  savings,
  net,
  homeCurrency,
}: {
  income: number;
  needs: number;
  wants: number;
  other: number;
  savings: number;
  net: number;
  homeCurrency: SupportedCurrency;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(el.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const overspent = net < 0;

  if (income <= 0) {
    return (
      <Card data-testid="money-flow">
        <CardContent className="px-4 py-6">
          <div className="flex h-20 items-center justify-center text-muted-foreground text-sm">
            No income recorded this month yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const uses: FlowNode[] = [
    { key: "needs", label: "Needs", value: needs, color: COLORS.needs },
    { key: "wants", label: "Wants", value: wants, color: COLORS.wants },
    { key: "other", label: "Other", value: other, color: COLORS.other },
    { key: "savings", label: "Savings", value: savings, color: COLORS.savings },
    ...(overspent
      ? []
      : [{ key: "net", label: "Net", value: net, color: COLORS.net }]),
  ].filter((n) => n.value > 0);

  const total = uses.reduce((sum, n) => sum + n.value, 0) || income;
  const pctOfIncome = (v: number) => Math.round((v / income) * 100);

  const W = Math.max(width, 260);
  const ribbonL = LEFT_X + BAR_W;
  const rightBarX = W - RIGHT_LABEL_W - BAR_W;
  // Height scales with node count so labels always have room, but stays compact.
  const plotH = Math.max(uses.length * MIN_ROW, 110);
  const H = plotH + TOP_PAD + BOT_PAD;
  const scale = (plotH - NODE_GAP * Math.max(uses.length - 1, 0)) / total;

  // Left source bar: income (green) on top, red shortfall segment when overspent.
  const incomeH = income * scale;
  const shortfallH = overspent ? Math.abs(net) * scale : 0;

  // Right nodes + matching left ribbon slices (same height, no left-side gap).
  let cursorR = TOP_PAD;
  let cursorL = TOP_PAD;
  const laidOut = uses.map((n) => {
    const h = n.value * scale;
    const rightY = cursorR;
    const leftY = cursorL;
    cursorR += h + NODE_GAP;
    cursorL += h;
    return { ...n, h, rightY, leftY, labelYc: rightY + h / 2 };
  });

  // Spread labels vertically so tiny slices don't collide.
  let prev = -Infinity;
  for (const n of laidOut) {
    if (n.labelYc < prev + MIN_ROW) n.labelYc = prev + MIN_ROW;
    prev = n.labelYc;
  }

  return (
    <Card data-testid="money-flow">
      <CardHeader className="flex flex-row items-baseline gap-2 space-y-0 p-4 pb-2">
        <span className="text-xs text-muted-foreground">Income</span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: COLORS.income }}
        >
          {formatCurrency(income, homeCurrency)}
        </span>
        {overspent && (
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: COLORS.shortfall }}
          >
            Over {formatCurrency(Math.abs(net), homeCurrency)}
          </span>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div ref={containerRef} className="w-full">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Money flow from income to spending, savings and net"
          >
            <style>{`.flow-ribbon{transition:fill-opacity .15s}.flow-ribbon:hover{fill-opacity:.55}`}</style>

            {/* Ribbons (drawn first so nodes sit on top) */}
            {laidOut.map((n) => (
              <path
                key={n.key}
                className="flow-ribbon"
                d={ribbonPath(ribbonL, n.leftY, rightBarX, n.rightY, n.h)}
                fill={n.color}
                fillOpacity={0.3}
              >
                <title>
                  {`${n.label}: ${formatCurrency(n.value, homeCurrency)} (${pctOfIncome(n.value)}% of income)`}
                </title>
              </path>
            ))}

            {/* Left source bar (income + optional shortfall) */}
            <rect
              x={LEFT_X}
              y={TOP_PAD}
              width={BAR_W}
              height={incomeH}
              rx={2}
              fill={COLORS.income}
            />
            {overspent && (
              <rect
                x={LEFT_X}
                y={TOP_PAD + incomeH}
                width={BAR_W}
                height={shortfallH}
                rx={2}
                fill={COLORS.shortfall}
              />
            )}

            {/* Right nodes + labels */}
            {laidOut.map((n) => (
              <g key={n.key} data-testid={`flow-node-${n.key}`}>
                <rect
                  x={rightBarX}
                  y={n.rightY}
                  width={BAR_W}
                  height={Math.max(n.h, 2)}
                  rx={2}
                  fill={n.color}
                />
                <text
                  x={rightBarX + BAR_W + 5}
                  y={n.labelYc - 2}
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--color-foreground)"
                >
                  {n.label}
                </text>
                <text
                  x={rightBarX + BAR_W + 5}
                  y={n.labelYc + 10}
                  fontSize={11}
                >
                  <tspan fontWeight={700} fill={n.color}>
                    {formatCurrency(n.value, homeCurrency)}
                  </tspan>
                  <tspan fill="var(--color-muted-foreground)">
                    {" "}
                    &middot; {pctOfIncome(n.value)}%
                  </tspan>
                </text>
              </g>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
