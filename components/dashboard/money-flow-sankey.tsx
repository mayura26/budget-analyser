"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

type FlowKey = MoneyFlowBreakdownBucket | "net";

type FlowNode = {
  key: FlowKey;
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
const RIGHT_LABEL_W = 100;
const DETAIL_LABEL_W = 220;
const NODE_HIT_W = 150;
const NODE_HIT_H = 44;
const TOP_PAD = 8;
const BOT_PAD = 8;
const NODE_GAP = 1.5;
const COMPACT_ROW = 30;
const EXPANDED_ROW = 58;
const DETAIL_ROW = 64;
const COMPACT_MIN_PLOT_H = 110;
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
  parent: FlowNode | undefined,
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
  const [activeKey, setActiveKey] = useState<MoneyFlowBreakdownBucket | null>(
    null,
  );

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
  const savingsFlow = Math.max(savings, sliceTotal(breakdown?.savings));

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
      : [{ key: "net" as const, label: "Net", value: net, color: COLORS.net }]),
  ];
  const uses = baseUses.filter((n) => n.value > 0);

  const bucketBreakdown = (key: FlowKey): MoneyFlowBreakdownSlice[] =>
    key === "net" ? [] : (breakdown?.[key] ?? []);

  const activeParent = uses.find((n) => n.key === activeKey);
  const activeSlices = detailSlices(
    activeKey ? (breakdown?.[activeKey] ?? []) : [],
    activeParent,
  );
  const hasActiveDetail = Boolean(activeParent && activeSlices.length > 0);
  const total = uses.reduce((sum, n) => sum + n.value, 0) || income;

  const W = Math.max(width, hasActiveDetail ? 760 : 260);
  const ribbonL = LEFT_X + BAR_W;
  const rightBarX = hasActiveDetail
    ? Math.min(Math.max(118, Math.round(W * 0.12)), W - DETAIL_LABEL_W - 360)
    : W - RIGHT_LABEL_W - BAR_W;
  const detailBarX = W - DETAIL_LABEL_W - BAR_W;
  const detailPlotH = hasActiveDetail
    ? Math.max(activeSlices.length * DETAIL_ROW, EXPANDED_MIN_PLOT_H)
    : 0;
  const plotH = hasActiveDetail
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
      expandable: bucketBreakdown(n.key).length > 0,
    };
  });
  spreadLabels(
    laidOut,
    hasActiveDetail ? EXPANDED_ROW : COMPACT_ROW,
    TOP_PAD + LABEL_TOP_INSET,
    TOP_PAD + plotH - LABEL_BOTTOM_INSET,
  );

  const selectedNode = laidOut.find((n) => n.key === activeKey);
  const activeTotal = activeSlices.reduce((sum, s) => sum + s.value, 0);
  const childPlotH = hasActiveDetail
    ? Math.max(
        activeSlices.length * DETAIL_ROW,
        Math.min(plotH, (selectedNode?.h ?? 0) * 1.6),
      )
    : 0;
  const childStartY =
    hasActiveDetail && selectedNode
      ? Math.min(
          Math.max(TOP_PAD, selectedNode.labelYc - childPlotH / 2),
          TOP_PAD + plotH - childPlotH,
        )
      : TOP_PAD;
  const childScale =
    activeTotal > 0
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
    DETAIL_ROW,
    childStartY + LABEL_TOP_INSET,
    childStartY + childPlotH - LABEL_BOTTOM_INSET,
  );

  function toggleNode(key: FlowKey) {
    if (key === "net" || bucketBreakdown(key).length === 0) return;
    setActiveKey((current) => (current === key ? null : key));
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, key: FlowKey) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleNode(key);
  }

  return (
    <Card data-testid="money-flow">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 pb-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">Income</span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: COLORS.income }}
          >
            {formatCurrency(income, homeCurrency)}
          </span>
          {activeParent && (
            <span className="text-[11px] font-semibold text-muted-foreground">
              {activeParent.label} breakdown
            </span>
          )}
          {overspent && (
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: COLORS.shortfall }}
            >
              Over {formatCurrency(Math.abs(net), homeCurrency)}
            </span>
          )}
        </div>
        {activeParent && (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Collapse money flow breakdown"
            onClick={() => setActiveKey(null)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div ref={containerRef} className="w-full overflow-x-auto">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Money flow from income to spending, savings and net"
          >
            <style>{`
              .flow-ribbon{transition:fill-opacity .15s}
              .flow-ribbon:hover{fill-opacity:.55}
              .flow-clickable{cursor:pointer}
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

            {selectedNode && hasActiveDetail && (
              <g data-testid={`flow-detail-panel-${selectedNode.key}`}>
                {laidOutChildren.map((child) => (
                  <path
                    key={`detail-ribbon-${child.key}`}
                    className="flow-ribbon"
                    d={ribbonPath(
                      rightBarX + BAR_W,
                      child.leftY,
                      detailBarX,
                      child.rightY,
                      child.h,
                    )}
                    fill={child.color}
                    fillOpacity={0.28}
                  >
                    <title>
                      {`${child.label}: ${formatCurrency(child.value, homeCurrency)} (${pctOf(child.value, selectedNode.value)}% of ${selectedNode.label})`}
                    </title>
                  </path>
                ))}
              </g>
            )}

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

              if (!n.expandable) {
                return (
                  <g key={n.key} data-testid={`flow-node-${n.key}`}>
                    {content}
                  </g>
                );
              }

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
                  onClick={() => toggleNode(n.key)}
                  onKeyDown={(event) => handleNodeKeyDown(event, n.key)}
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

            {selectedNode &&
              hasActiveDetail &&
              laidOutChildren.map((child) => (
                <g
                  key={child.key}
                  data-testid={`flow-detail-${selectedNode.key}-${child.key}`}
                >
                  <rect
                    x={detailBarX}
                    y={child.rightY}
                    width={BAR_W}
                    height={Math.max(child.h, 2)}
                    rx={2}
                    fill={child.color}
                  />
                  <text
                    x={detailBarX + BAR_W + 5}
                    y={child.labelYc - 2}
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                  >
                    {shortLabel(child.label, 22)}
                  </text>
                  <text
                    x={detailBarX + BAR_W + 5}
                    y={child.labelYc + 10}
                    fontSize={11}
                  >
                    <tspan fontWeight={700} fill={child.color}>
                      {formatCurrency(child.value, homeCurrency)}
                    </tspan>
                    <tspan fill="var(--color-muted-foreground)">
                      {" "}
                      &middot; {pctOf(child.value, selectedNode.value)}%
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
