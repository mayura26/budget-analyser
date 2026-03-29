"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import {
  buildTreemapDatumForNodes,
  sliceCategoryTreeForDrill,
} from "@/lib/analytics/treemap-helpers";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { CategoryHierarchyNode } from "@/types";

function breadcrumbTrail(
  roots: CategoryHierarchyNode[],
  path: number[],
): { id: number; name: string }[] {
  const out: { id: number; name: string }[] = [];
  let cur = roots;
  for (const id of path) {
    const n = cur.find((x) => x.id === id);
    if (!n) break;
    out.push({ id: n.id as number, name: n.name });
    cur = n.children;
  }
  return out;
}

/** Treemap node payload from Recharts (partial). */
type TreemapTooltipPayload = {
  name?: string;
  value?: number;
  fill?: string;
};

export function AnalyticsCategoryExplorer({
  categoryRoots,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  categoryRoots: CategoryHierarchyNode[];
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const [drillPath, setDrillPath] = useState<number[]>([]);

  const displayedNodes = useMemo(
    () => sliceCategoryTreeForDrill(categoryRoots, drillPath),
    [categoryRoots, drillPath],
  );

  const treemapData = useMemo(
    () => buildTreemapDatumForNodes(displayedNodes),
    [displayedNodes],
  );

  const crumbs = useMemo(
    () => breadcrumbTrail(categoryRoots, drillPath),
    [categoryRoots, drillPath],
  );

  const parentTotal = useMemo(() => {
    if (drillPath.length === 0) {
      return categoryRoots.reduce((s, n) => s + n.total, 0);
    }
    let cur = categoryRoots;
    let parent: CategoryHierarchyNode | undefined;
    for (const id of drillPath) {
      parent = cur.find((x) => x.id === id);
      if (!parent) return 0;
      cur = parent.children;
    }
    return parent?.total ?? 0;
  }, [categoryRoots, drillPath]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Spending by category
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Expense debits in home currency; transfers excluded. Click a row to
          drill into subcategories.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <nav
          aria-label="Category drill-down"
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setDrillPath([])}
          >
            All
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <button
                type="button"
                className={
                  i === crumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-primary hover:underline"
                }
                onClick={() => setDrillPath(drillPath.slice(0, i + 1))}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        {treemapData && displayedNodes.some((n) => n.total > 0) ? (
          <div className="hidden md:block h-[280px] w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={[treemapData]}
                dataKey="value"
                nameKey="name"
                stroke="rgba(0,0,0,0.08)"
                fill="#8884d8"
                isAnimationActive={false}
              >
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as TreemapTooltipPayload;
                    return (
                      <div className="chart-tooltip">
                        <p className="chart-tooltip-label">{p.name}</p>
                        <p className="font-semibold">
                          {formatCurrency(p.value ?? 0, homeCurrency)}
                        </p>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="hidden md:flex h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No spending in this period for this view
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Category</th>
                <th className="p-2 font-medium text-right">Amount</th>
                <th className="p-2 font-medium text-right hidden sm:table-cell">
                  Share
                </th>
                <th className="p-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedNodes.filter((n) => n.total > 0).length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No spending in this period
                  </td>
                </tr>
              ) : (
                displayedNodes
                  .filter((n) => n.total > 0)
                  .map((n) => {
                    const pct =
                      parentTotal > 0
                        ? Math.round((n.total / parentTotal) * 100)
                        : 0;
                    const canDrill = n.children.some((c) => c.total > 0);
                    return (
                      <tr key={String(n.id)} className="border-b last:border-0">
                        <td className="p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: n.color }}
                            />
                            {canDrill && n.id !== null ? (
                              <button
                                type="button"
                                className="text-left font-medium hover:underline truncate"
                                onClick={() =>
                                  setDrillPath([...drillPath, n.id as number])
                                }
                              >
                                {n.name}
                              </button>
                            ) : (
                              <span className="font-medium truncate">
                                {n.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground pl-4 mt-0.5">
                            {n.transactionCount} transaction
                            {n.transactionCount !== 1 ? "s" : ""}
                          </p>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatCurrency(n.total, homeCurrency)}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {pct}%
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Link
                            href={transactionsInRangeUrl({
                              from: rangeStart,
                              to: rangeEnd,
                              categoryId: n.id === null ? "none" : n.id,
                            })}
                            className="text-xs text-primary hover:underline"
                          >
                            Transactions
                          </Link>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
