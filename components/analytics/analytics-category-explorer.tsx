"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import { buildTreemapDatumForNodes } from "@/lib/analytics/treemap-helpers";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type {
  AnalyticsExpenseTransactionLine,
  CategoryHierarchyNode,
} from "@/types";

function categoryKey(id: number | null): string {
  return id === null ? "none" : String(id);
}

/** Treemap node payload from Recharts (partial). */
type TreemapTooltipPayload = {
  name?: string;
  value?: number;
  fill?: string;
};

function CategoryTreeRows({
  nodes,
  parentTotal,
  depth,
  expenseTransactionsByCategory,
  expanded,
  toggleExpanded,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  nodes: CategoryHierarchyNode[];
  parentTotal: number;
  depth: number;
  expenseTransactionsByCategory: Record<string, AnalyticsExpenseTransactionLine[]>;
  expanded: Set<string>;
  toggleExpanded: (key: string) => void;
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const visible = nodes.filter((n) => n.total > 0);
  return (
    <>
      {visible.map((node) => (
        <CategoryRow
          key={categoryKey(node.id)}
          node={node}
          parentTotal={parentTotal}
          depth={depth}
          expenseTransactionsByCategory={expenseTransactionsByCategory}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          homeCurrency={homeCurrency}
        />
      ))}
    </>
  );
}

function CategoryRow({
  node,
  parentTotal,
  depth,
  expenseTransactionsByCategory,
  expanded,
  toggleExpanded,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  node: CategoryHierarchyNode;
  parentTotal: number;
  depth: number;
  expenseTransactionsByCategory: Record<string, AnalyticsExpenseTransactionLine[]>;
  expanded: Set<string>;
  toggleExpanded: (key: string) => void;
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const key = categoryKey(node.id);
  const directTxns = expenseTransactionsByCategory[key] ?? [];
  const hasChildCategories = node.children.length > 0;
  const canExpand = hasChildCategories || directTxns.length > 0;
  const isExpanded = expanded.has(key);
  const pct =
    parentTotal > 0 ? Math.round((node.total / parentTotal) * 100) : 0;

  const padLeft = 8 + depth * 16;

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="p-2 align-top" style={{ paddingLeft: padLeft }}>
          <div className="flex items-start gap-2 min-w-0">
            <div className="w-6 shrink-0 flex justify-center pt-0.5">
              {canExpand ? (
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-muted text-foreground"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
                  onClick={() => toggleExpanded(key)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: node.color }}
                />
                <span className="font-medium truncate">{node.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {node.transactionCount} transaction
                {node.transactionCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </td>
        <td className="p-2 text-right tabular-nums align-top">
          {formatCurrency(node.total, homeCurrency)}
        </td>
        <td className="p-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell align-top">
          {pct}%
        </td>
        <td className="p-2 text-right whitespace-nowrap align-top">
          <Link
            href={transactionsInRangeUrl({
              from: rangeStart,
              to: rangeEnd,
              categoryId: node.id === null ? "none" : node.id,
            })}
            className="text-xs text-primary hover:underline"
          >
            Transactions
          </Link>
        </td>
      </tr>
      {isExpanded && (
        <>
          {hasChildCategories ? (
            <CategoryTreeRows
              nodes={node.children}
              parentTotal={node.total}
              depth={depth + 1}
              expenseTransactionsByCategory={expenseTransactionsByCategory}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              homeCurrency={homeCurrency}
            />
          ) : null}
          {directTxns.map((t) => {
            const txnPct =
              node.total > 0
                ? Math.round((t.converted / node.total) * 100)
                : 0;
            const txnPad = 8 + (depth + 1) * 16;
            return (
              <tr
                key={`txn-${t.id}`}
                className="border-b last:border-0 bg-muted/25 text-muted-foreground"
              >
                <td className="p-2 py-1.5" style={{ paddingLeft: txnPad }}>
                  <div className="text-xs tabular-nums">{t.date}</div>
                  <div className="text-sm text-foreground/90 truncate">
                    {t.description}
                  </div>
                  <div className="text-xs truncate">{t.accountName}</div>
                </td>
                <td className="p-2 py-1.5 text-right tabular-nums text-foreground text-sm">
                  {formatCurrency(t.converted, homeCurrency)}
                </td>
                <td className="p-2 py-1.5 text-right tabular-nums text-xs hidden sm:table-cell">
                  {txnPct}%
                </td>
                <td className="p-2 py-1.5 text-right text-xs">—</td>
              </tr>
            );
          })}
        </>
      )}
    </>
  );
}

export function AnalyticsCategoryExplorer({
  categoryRoots,
  expenseTransactionsByCategory,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  categoryRoots: CategoryHierarchyNode[];
  expenseTransactionsByCategory: Record<string, AnalyticsExpenseTransactionLine[]>;
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const treemapData = useMemo(
    () => buildTreemapDatumForNodes(categoryRoots),
    [categoryRoots],
  );

  const rootParentTotal = useMemo(
    () => categoryRoots.reduce((s, n) => s + n.total, 0),
    [categoryRoots],
  );

  const hasAnySpending = categoryRoots.some((n) => n.total > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Spending by category
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Expense debits in home currency; transfers excluded. Expand a category
          to see subcategories and transactions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {treemapData && hasAnySpending ? (
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
              {!hasAnySpending ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No spending in this period
                  </td>
                </tr>
              ) : (
                <CategoryTreeRows
                  nodes={categoryRoots}
                  parentTotal={rootParentTotal}
                  depth={0}
                  expenseTransactionsByCategory={expenseTransactionsByCategory}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  homeCurrency={homeCurrency}
                />
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
