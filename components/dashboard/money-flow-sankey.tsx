"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const H = 300;
const TOP_PAD = 20;
const BOT_PAD = 20;
const NODE_GAP = 2; // surface gap between stacked fills (dataviz mark spec)
const BAR_W = 14;
const LEFT_LABEL_W = 70;
const RIGHT_LABEL_W = 112;

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
  transactionCount,
  accountCount,
  homeCurrency,
}: {
  income: number;
  needs: number;
  wants: number;
  other: number;
  savings: number;
  net: number;
  transactionCount: number;
  accountCount: number;
  homeCurrency: SupportedCurrency;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const meta = (
    <p className="text-xs text-muted-foreground mt-3">
      {transactionCount} transaction{transactionCount !== 1 ? "s" : ""} &middot;{" "}
      {accountCount} account{accountCount !== 1 ? "s" : ""}
    </p>
  );

  const header = (
    <CardHeader>
      <CardTitle className="text-base font-semibold">Money flow</CardTitle>
      <p className="text-xs text-muted-foreground font-normal">
        How this month&rsquo;s income was split.
      </p>
    </CardHeader>
  );

  if (income <= 0) {
    return (
      <Card data-testid="money-flow">
        {header}
        <CardContent>
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            No income recorded this month yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const overspent = net < 0;

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

  const W = Math.max(width, 280);
  const leftBarX = LEFT_LABEL_W + 6;
  const rightBarX = W - RIGHT_LABEL_W - BAR_W;
  const plotH = H - TOP_PAD - BOT_PAD;
  // Ribbons tile continuously on the left; right nodes carry the surface gaps.
  const scale = (plotH - NODE_GAP * Math.max(uses.length - 1, 0)) / total;

  // Left source bar: income (green) on top, plus a red shortfall segment when overspent.
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
    return { ...n, h, rightY, leftY };
  });

  const xLeftEdge = leftBarX + BAR_W;

  return (
    <Card data-testid="money-flow">
      {header}
      <CardContent>
        <div ref={containerRef} className="w-full">
          {width > 0 && (
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
                  d={ribbonPath(xLeftEdge, n.leftY, rightBarX, n.rightY, n.h)}
                  fill={n.color}
                  fillOpacity={0.3}
                >
                  <title>
                    {`${n.label}: ${formatCurrency(n.value, homeCurrency)} (${pctOfIncome(n.value)}% of income)`}
                  </title>
                </path>
              ))}

              {/* Left source bar */}
              <rect
                x={leftBarX}
                y={TOP_PAD}
                width={BAR_W}
                height={incomeH}
                rx={3}
                fill={COLORS.income}
              />
              {overspent && (
                <rect
                  x={leftBarX}
                  y={TOP_PAD + incomeH}
                  width={BAR_W}
                  height={shortfallH}
                  rx={3}
                  fill={COLORS.shortfall}
                />
              )}

              {/* Income label (right-aligned, centered on the income segment) */}
              <text
                x={leftBarX - 6}
                y={TOP_PAD + incomeH / 2 - 3}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted-foreground)"
              >
                Income
              </text>
              <text
                x={leftBarX - 6}
                y={TOP_PAD + incomeH / 2 + 11}
                textAnchor="end"
                fontSize={12.5}
                fontWeight={700}
                fill={COLORS.income}
              >
                {formatCurrency(income, homeCurrency)}
              </text>

              {/* Shortfall label */}
              {overspent && (
                <>
                  <text
                    x={leftBarX - 6}
                    y={TOP_PAD + incomeH + shortfallH / 2 - 3}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--color-muted-foreground)"
                  >
                    Shortfall
                  </text>
                  <text
                    x={leftBarX - 6}
                    y={TOP_PAD + incomeH + shortfallH / 2 + 11}
                    textAnchor="end"
                    fontSize={12.5}
                    fontWeight={700}
                    fill={COLORS.shortfall}
                  >
                    {formatCurrency(Math.abs(net), homeCurrency)}
                  </text>
                </>
              )}

              {/* Right nodes + labels */}
              {laidOut.map((n) => {
                const yc = n.rightY + n.h / 2;
                return (
                  <g key={n.key} data-testid={`flow-node-${n.key}`}>
                    <rect
                      x={rightBarX}
                      y={n.rightY}
                      width={BAR_W}
                      height={Math.max(n.h, 1)}
                      rx={3}
                      fill={n.color}
                    />
                    <text
                      x={rightBarX + BAR_W + 6}
                      y={yc - 3}
                      fontSize={12}
                      fill="var(--color-muted-foreground)"
                    >
                      {n.label} &middot; {pctOfIncome(n.value)}%
                    </text>
                    <text
                      x={rightBarX + BAR_W + 6}
                      y={yc + 11}
                      fontSize={12.5}
                      fontWeight={700}
                      fill={n.color}
                    >
                      {formatCurrency(n.value, homeCurrency)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        {meta}
      </CardContent>
    </Card>
  );
}
