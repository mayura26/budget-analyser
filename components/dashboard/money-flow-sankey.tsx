"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type {
  MoneyFlowBreakdown,
  MoneyFlowBreakdownBucket,
  MoneyFlowBreakdownSlice,
} from "@/types";

// Semantic flow colors mirror the dashboard charts.
const COLORS = {
  income: "#22c55e",
  needs: "#3b82f6",
  wants: "#f97316",
  other: "#94a3b8",
  savings: "#059669",
  net: "#14b8a6",
  shortfall: "#ef4444",
} as const;

type OutputFlowKey = Exclude<MoneyFlowBreakdownBucket, "income"> | "net";
type DetailFlowKey = MoneyFlowBreakdownBucket;

type FlowNode = {
  key: OutputFlowKey;
  label: string;
  value: number;
  color: string;
};

type LaidOutNode = FlowNode & {
  h: number;
  rightY: number;
  leftY: number;
  labelYc: number;
  expandable: boolean;
};

type LaidOutSlice = MoneyFlowBreakdownSlice & {
  h: number;
  rightY: number;
  leftY: number;
  labelYc: number;
};

const BAR_W = 10;
const LEFT_X = 5;
const RIGHT_LABEL_W = 112;
const DETAIL_LABEL_W = 220;
const SOURCE_LABEL_W = 146;
const NODE_HIT_W = 150;
const NODE_HIT_H = 44;
const TOP_PAD = 10;
const BOT_PAD = 10;
const NODE_GAP = 1.5;
const COMPACT_ROW = 38;
const EXPANDED_ROW = 58;
const DETAIL_ROW = 64;
const COMPACT_MIN_W = 320;
const OUTPUT_EXPANDED_MIN_W = 860;
const INCOME_EXPANDED_MIN_W = 720;
const COMPACT_MIN_PLOT_H = 160;
const EXPANDED_MIN_PLOT_H = 360;
const LABEL_TOP_INSET = 18;
const LABEL_BOTTOM_INSET = 22;

/** Cubic-bezier flow ribbon between a left slice and a right node. */
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

function shortLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(1, maxChars - 1)).trim()}...`;
}

function pctOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function detailSlices(
  slices: MoneyFlowBreakdownSlice[],
  parent: { value: number } | undefined,
): MoneyFlowBreakdownSlice[] {
  if (!parent) return [];
  return slices.filter((s) => s.value > 0);
}

function spreadLabels<T extends { labelYc: number }>(
  items: T[],
  minRow: number,
  minY: number,
  maxY: number,
) {
  if (items.length === 0) return;

  let prev = -Infinity;
  for (const item of items) {
    item.labelYc = Math.max(item.labelYc, minY, prev + minRow);
    prev = item.labelYc;
  }

  let next = Infinity;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.labelYc = Math.min(item.labelYc, maxY, next - minRow);
    next = item.labelYc;
  }
}

function sliceTotal(slices: MoneyFlowBreakdownSlice[] | undefined): number {
  return (
    Math.round(
      (slices ?? [])
        .filter((slice) => slice.value > 0)
        .reduce((sum, slice) => sum + slice.value, 0) * 100,
    ) / 100
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
  breakdown,
}: {
  income: number;
  needs: number;
  wants: number;
  other: number;
  savings: number;
  net: number;
  homeCurrency: SupportedCurrency;
  breakdown?: MoneyFlowBreakdown;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [activeKey, setActiveKey] = useState<DetailFlowKey | null>(null);

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

  const needsFlow = Math.max(needs, sliceTotal(breakdown?.needs));
  const wantsFlow = Math.max(wants, sliceTotal(breakdown?.wants));
  const otherFlow = Math.max(other, sliceTotal(breakdown?.other));
  const savingsRawFlow = Math.max(savings, sliceTotal(breakdown?.savings));
  const sourceTotal = income + (overspent ? Math.abs(net) : 0);
  const spendingFlow = needsFlow + wantsFlow + otherFlow;
  const remainingAfterSpending = Math.max(0, sourceTotal - spendingFlow);
  const savingsFlow = Math.min(
    savingsRawFlow,
    Math.max(0, remainingAfterSpending - (overspent ? 0 : Math.max(0, net))),
  );
  const netFlow = overspent
    ? 0
    : Math.max(0, sourceTotal - spendingFlow - savingsFlow);

  const baseUses: FlowNode[] = [
    { key: "needs", label: "Needs", value: needsFlow, color: COLORS.needs },
    { key: "wants", label: "Wants", value: wantsFlow, color: COLORS.wants },
    { key: "other", label: "Other", value: otherFlow, color: COLORS.other },
    {
      key: "savings",
      label: "Savings",
      value: savingsFlow,
      color: COLORS.savings,
    },
    ...(overspent
      ? []
      : [
          {
            key: "net" as const,
            label: "Net",
            value: netFlow,
            color: COLORS.net,
          },
        ]),
  ];
  const uses = baseUses.filter((n) => n.value > 0);

  const detailBreakdown = (key: DetailFlowKey): MoneyFlowBreakdownSlice[] =>
    breakdown?.[key] ?? [];

  const activeSlices = detailSlices(
    activeKey ? detailBreakdown(activeKey) : [],
    activeKey ? { value: 1 } : undefined,
  );
  const hasActiveDetail = Boolean(activeKey && activeSlices.length > 0);
  const hasIncomeDetail = hasActiveDetail && activeKey === "income";
  const hasOutputDetail = hasActiveDetail && activeKey !== "income";
  const total = uses.reduce((sum, n) => sum + n.value, 0) || income;

  const W = Math.max(
    width,
    hasIncomeDetail
      ? INCOME_EXPANDED_MIN_W
      : hasOutputDetail
        ? OUTPUT_EXPANDED_MIN_W
        : COMPACT_MIN_W,
  );
  const incomeBarX = hasIncomeDetail
    ? Math.max(SOURCE_LABEL_W + BAR_W + 90, Math.round(W * 0.39))
    : LEFT_X;
  const sourceBarX = SOURCE_LABEL_W;
  const ribbonL = incomeBarX + BAR_W;
  const rightBarX = hasOutputDetail
    ? Math.min(Math.max(118, Math.round(W * 0.12)), W - DETAIL_LABEL_W - 360)
    : W - RIGHT_LABEL_W - BAR_W;
  const detailBarX = W - DETAIL_LABEL_W - BAR_W;
  const detailPlotH = hasOutputDetail
    ? Math.max(activeSlices.length * DETAIL_ROW, EXPANDED_MIN_PLOT_H)
    : 0;
  const plotH = hasOutputDetail
    ? Math.max(uses.length * EXPANDED_ROW, detailPlotH, EXPANDED_MIN_PLOT_H)
    : Math.max(uses.length * COMPACT_ROW, COMPACT_MIN_PLOT_H);
  const H = plotH + TOP_PAD + BOT_PAD;
  const scale = (plotH - NODE_GAP * Math.max(uses.length - 1, 0)) / total;

  const incomeH = income * scale;
  const shortfallH = overspent ? Math.abs(net) * scale : 0;

  let cursorR = TOP_PAD;
  let cursorL = TOP_PAD;
  const laidOut: LaidOutNode[] = uses.map((n) => {
    const h = n.value * scale;
    const rightY = cursorR;
    const leftY = cursorL;
    cursorR += h + NODE_GAP;
    cursorL += h;
    return {
      ...n,
      h,
      rightY,
      leftY,
      labelYc: rightY + h / 2,
      expandable: n.key !== "net" && detailBreakdown(n.key).length > 0,
    };
  });
  spreadLabels(
    laidOut,
    hasOutputDetail ? EXPANDED_ROW : COMPACT_ROW,
    TOP_PAD + LABEL_TOP_INSET,
    TOP_PAD + plotH - LABEL_BOTTOM_INSET,
  );

  const selectedNode =
    activeKey === "income" ? null : laidOut.find((n) => n.key === activeKey);
  const activeParent =
    activeKey === "income"
      ? {
          key: "income" as const,
          label: "Income",
          value: income,
          color: COLORS.income,
          h: incomeH,
          labelYc: TOP_PAD + incomeH / 2,
        }
      : selectedNode;
  const activeTotal = activeSlices.reduce((sum, s) => sum + s.value, 0);
  const childPlotH = hasOutputDetail
    ? Math.max(
        activeSlices.length * DETAIL_ROW,
        Math.min(plotH, (activeParent?.h ?? 0) * 1.6),
      )
    : hasIncomeDetail
      ? incomeH
      : 0;
  const childStartY =
    hasOutputDetail && activeParent
      ? Math.min(
          Math.max(TOP_PAD, activeParent.labelYc - childPlotH / 2),
          TOP_PAD + plotH - childPlotH,
        )
      : hasIncomeDetail
        ? TOP_PAD
        : TOP_PAD;
  const childScale = hasIncomeDetail
    ? scale
    : activeTotal > 0
      ? (childPlotH - NODE_GAP * Math.max(activeSlices.length - 1, 0)) /
        activeTotal
      : 0;

  let cursorChildR = childStartY;
  let cursorChildL = childStartY;
  const laidOutChildren: LaidOutSlice[] = activeSlices.map((slice) => {
    const h = slice.value * childScale;
    const rightY = cursorChildR;
    const leftY = cursorChildL;
    cursorChildR += h + NODE_GAP;
    cursorChildL += h;
    return {
      ...slice,
      h,
      rightY,
      leftY,
      labelYc: rightY + h / 2,
    };
  });
  spreadLabels(
    laidOutChildren,
    hasIncomeDetail ? COMPACT_ROW : DETAIL_ROW,
    childStartY + LABEL_TOP_INSET,
    childStartY + childPlotH - LABEL_BOTTOM_INSET,
  );

  const incomeExpandable = detailBreakdown("income").length > 0;

  function toggleNode(key: DetailFlowKey) {
    if (detailBreakdown(key).length === 0) return;
    setActiveKey((current) => (current === key ? null : key));
  }

  function handleNodeKeyDown(
    event: KeyboardEvent<SVGGElement>,
    key: DetailFlowKey,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleNode(key);
  }

  return (
    <Card data-testid="money-flow">
      <CardContent className="p-4">
        <div ref={containerRef} className="w-full overflow-x-auto">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full"
            style={{ minWidth: W }}
            role="img"
            aria-label="Money flow from income to spending, savings and net"
          >
            <style>{`
              .flow-ribbon{transition:fill-opacity .15s}
              .flow-ribbon:hover{fill-opacity:.55}
              .flow-clickable{cursor:pointer;outline:none}
              .flow-clickable:hover .node-bar{filter:brightness(1.04)}
              .flow-clickable:focus-visible .node-bar{stroke:var(--color-foreground);stroke-width:1.5}
            `}</style>

            {laidOut.map((n) => {
              const active = n.key === activeKey;
              return (
                <g key={`flow-${n.key}`}>
                  <path
                    className="flow-ribbon"
                    d={ribbonPath(ribbonL, n.leftY, rightBarX, n.rightY, n.h)}
                    fill={n.color}
                    fillOpacity={active ? 0.52 : 0.3}
                  >
                    <title>
                      {`${n.label}: ${formatCurrency(n.value, homeCurrency)} (${pctOf(n.value, income)}% of income)`}
                    </title>
                  </path>
                </g>
              );
            })}

            {activeParent && hasActiveDetail && (
              <g data-testid={`flow-detail-panel-${activeParent.key}`}>
                {laidOutChildren.map((child) => (
                  <path
                    key={`detail-ribbon-${child.key}`}
                    className="flow-ribbon"
                    d={ribbonPath(
                      hasIncomeDetail ? sourceBarX + BAR_W : rightBarX + BAR_W,
                      child.leftY,
                      hasIncomeDetail ? incomeBarX : detailBarX,
                      child.rightY,
                      child.h,
                    )}
                    fill={child.color}
                    fillOpacity={0.28}
                  >
                    <title>
                      {`${child.label}: ${formatCurrency(child.value, homeCurrency)} (${pctOf(child.value, activeParent.value)}% of ${activeParent.label})`}
                    </title>
                  </path>
                ))}
              </g>
            )}

            {incomeExpandable ? (
              // biome-ignore lint/a11y/useSemanticElements: SVG nodes are the interactive chart target; an HTML button cannot wrap this geometry.
              <g
                data-testid="flow-node-income"
                className="flow-clickable"
                role="button"
                tabIndex={0}
                aria-label={`${activeKey === "income" ? "Collapse" : "Expand"} Income breakdown`}
                aria-expanded={activeKey === "income"}
                onClick={() => toggleNode("income")}
                onKeyDown={(event) => handleNodeKeyDown(event, "income")}
              >
                <rect
                  x={Math.max(0, incomeBarX - 4)}
                  y={TOP_PAD}
                  width={Math.max(120, W - incomeBarX - rightBarX + 90)}
                  height={Math.max(incomeH, NODE_HIT_H)}
                  rx={4}
                  fill="transparent"
                />
                <rect
                  className="node-bar"
                  data-testid="flow-source-income"
                  x={incomeBarX}
                  y={TOP_PAD}
                  width={BAR_W}
                  height={incomeH}
                  rx={2}
                  fill={COLORS.income}
                  stroke={
                    activeKey === "income"
                      ? "var(--color-foreground)"
                      : "transparent"
                  }
                  strokeWidth={activeKey === "income" ? 1.5 : 0}
                />
                <text
                  x={incomeBarX + BAR_W + 6}
                  y={TOP_PAD + 14}
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--color-foreground)"
                >
                  Income
                </text>
                <text
                  x={incomeBarX + BAR_W + 6}
                  y={TOP_PAD + 27}
                  fontSize={11}
                  fontWeight={700}
                  fill={COLORS.income}
                >
                  {formatCurrency(income, homeCurrency)}
                </text>
              </g>
            ) : (
              <g data-testid="flow-node-income">
                <rect
                  data-testid="flow-source-income"
                  x={incomeBarX}
                  y={TOP_PAD}
                  width={BAR_W}
                  height={incomeH}
                  rx={2}
                  fill={COLORS.income}
                />
                <text
                  x={incomeBarX + BAR_W + 6}
                  y={TOP_PAD + 14}
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--color-foreground)"
                >
                  Income
                </text>
                <text
                  x={incomeBarX + BAR_W + 6}
                  y={TOP_PAD + 27}
                  fontSize={11}
                  fontWeight={700}
                  fill={COLORS.income}
                >
                  {formatCurrency(income, homeCurrency)}
                </text>
              </g>
            )}
            {overspent && (
              <rect
                data-testid="flow-source-shortfall"
                x={incomeBarX}
                y={TOP_PAD + incomeH}
                width={BAR_W}
                height={shortfallH}
                rx={2}
                fill={COLORS.shortfall}
              />
            )}

            {laidOut.map((n) => {
              const active = n.key === activeKey;
              const content = (
                <>
                  <rect
                    className="node-bar"
                    x={rightBarX}
                    y={n.rightY}
                    width={BAR_W}
                    height={Math.max(n.h, 2)}
                    rx={2}
                    fill={n.color}
                    stroke={active ? "var(--color-foreground)" : "transparent"}
                    strokeWidth={active ? 1.5 : 0}
                  />
                  <text
                    x={rightBarX + BAR_W + 5}
                    y={n.labelYc - 2}
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                  >
                    {shortLabel(n.label, hasActiveDetail ? 10 : 14)}
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
                      &middot; {pctOf(n.value, income)}%
                    </tspan>
                  </text>
                </>
              );

              if (n.key === "net" || !n.expandable) {
                return (
                  <g key={n.key} data-testid={`flow-node-${n.key}`}>
                    {content}
                  </g>
                );
              }

              const detailKey: DetailFlowKey = n.key;

              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG nodes are the interactive chart target; an HTML button cannot wrap this geometry.
                <g
                  key={n.key}
                  data-testid={`flow-node-${n.key}`}
                  className="flow-clickable"
                  role="button"
                  tabIndex={0}
                  aria-label={`${active ? "Collapse" : "Expand"} ${n.label} breakdown`}
                  aria-expanded={active}
                  onClick={() => toggleNode(detailKey)}
                  onKeyDown={(event) => handleNodeKeyDown(event, detailKey)}
                >
                  <rect
                    x={rightBarX - 5}
                    y={n.labelYc - NODE_HIT_H / 2}
                    width={NODE_HIT_W}
                    height={NODE_HIT_H}
                    rx={4}
                    fill="transparent"
                  />
                  {content}
                </g>
              );
            })}

            {activeParent &&
              hasActiveDetail &&
              laidOutChildren.map((child) => (
                <g
                  key={child.key}
                  data-testid={`flow-detail-${activeParent.key}-${child.key}`}
                >
                  <rect
                    x={hasIncomeDetail ? sourceBarX : detailBarX}
                    y={child.rightY}
                    width={BAR_W}
                    height={Math.max(child.h, 2)}
                    rx={2}
                    fill={child.color}
                  />
                  <text
                    x={
                      hasIncomeDetail ? sourceBarX - 6 : detailBarX + BAR_W + 5
                    }
                    y={child.labelYc - 2}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={hasIncomeDetail ? "end" : undefined}
                    fill="var(--color-foreground)"
                  >
                    {shortLabel(child.label, hasIncomeDetail ? 18 : 22)}
                  </text>
                  <text
                    x={
                      hasIncomeDetail ? sourceBarX - 6 : detailBarX + BAR_W + 5
                    }
                    y={child.labelYc + 10}
                    fontSize={11}
                    textAnchor={hasIncomeDetail ? "end" : undefined}
                  >
                    <tspan fontWeight={700} fill={child.color}>
                      {formatCurrency(child.value, homeCurrency)}
                    </tspan>
                    <tspan fill="var(--color-muted-foreground)">
                      {" "}
                      &middot; {pctOf(child.value, activeParent.value)}%
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
