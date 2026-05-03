"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { BudgetProgressBar } from "@/components/budget/budget-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { saveBudgetTargets } from "@/lib/actions/budget-targets";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import type { SupportedCurrency } from "@/lib/currency/supported";
import {
  budgetCategoryShortTitle,
  cn,
  currencySymbol,
  formatCurrency,
} from "@/lib/utils";
import type {
  AnalyticsBudgetTransactionLine,
  BudgetCategoryRow,
} from "@/types";

type GroupedRows = { group: string; rows: BudgetCategoryRow[] }[];

function groupRows(rows: BudgetCategoryRow[]): GroupedRows {
  const map = new Map<string, BudgetCategoryRow[]>();
  for (const row of rows) {
    const group = row.parentName;
    if (!map.has(group)) map.set(group, []);
    map.get(group)?.push(row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({ group, rows }));
}

const gridColsBase =
  "grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:grid-cols-[auto_1fr_7rem_7rem_minmax(6rem,1fr)_6rem]";
const gridColsDrilldown =
  "grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] sm:grid-cols-[auto_auto_1fr_7rem_7rem_minmax(6rem,1fr)_6rem]";

function CategoryRow({
  row,
  editingId,
  onEdit,
  onBlur,
  readOnly,
  homeCurrency,
  expenseTransactionsByCategory,
  monthRangeStart,
  monthRangeEnd,
  expanded,
  onToggleExpand,
}: {
  row: BudgetCategoryRow;
  editingId: number | null;
  onEdit: (id: number) => void;
  onBlur: () => void;
  readOnly: boolean;
  homeCurrency: SupportedCurrency;
  expenseTransactionsByCategory?:
    | Record<string, AnalyticsBudgetTransactionLine[]>
    | undefined;
  monthRangeStart: string;
  monthRangeEnd: string;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isSynthetic = row.isSyntheticSurplus === true;
  const isEditing = !isSynthetic && editingId === row.categoryId;
  const barSpentForPct =
    isSynthetic && row.targetAmount > 0
      ? Math.max(0, row.actualSpent)
      : row.actualSpent;
  const pct =
    row.targetAmount > 0
      ? Math.round((barSpentForPct / row.targetAmount) * 100)
      : row.targetAmount < 0
        ? Math.round((row.actualSpent / row.targetAmount) * 100)
        : 0;
  const remaining = row.targetAmount - row.actualSpent;
  const belowScheduled =
    row.targetAmount > 0 && row.targetAmount < row.scheduledAmount;

  const catKey = String(row.categoryId);
  const lines = expenseTransactionsByCategory?.[catKey] ?? [];
  const drilldownContext = expenseTransactionsByCategory != null;
  const canDrillDown = !isSynthetic && lines.length > 0;

  const gridClass = drilldownContext ? gridColsDrilldown : gridColsBase;

  return (
    <div className="rounded-md">
      <div
        className={cn(
          "grid items-center gap-x-2 sm:gap-x-3 py-2 px-2 sm:px-3 hover:bg-muted/50 rounded-md transition-colors",
          gridClass,
        )}
      >
        {drilldownContext ? (
          <div className="w-6 shrink-0 flex justify-center">
            {canDrillDown ? (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted text-foreground"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Hide" : "Show"} transactions for ${row.categoryName}`}
                onClick={onToggleExpand}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Color dot */}
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: row.color }}
        />

        {/* Category name: short on mobile when name has (…) or […] */}
        <div
          className="min-w-0 truncate text-sm flex items-center gap-1"
          title={row.categoryName}
          aria-label={row.categoryName}
        >
          <span className="sm:hidden min-w-0 truncate">
            {budgetCategoryShortTitle(row.categoryName)}
          </span>
          <span className="hidden sm:inline min-w-0 truncate">
            {row.categoryName}
          </span>
          {isSynthetic ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
                    aria-label="How surplus is calculated"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p className="font-medium mb-1">Computed row (not a category)</p>
                  <p>
                    Target: scheduled expected income minus all expense and savings
                    targets. Actual: income basis (max of scheduled and realised)
                    minus expense outflows minus savings transfers — updates as the
                    month progresses.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>

        {/* Target (editable) */}
        <div className="text-right">
          {isSynthetic ? (
            <span
              className={cn(
                "text-sm tabular-nums px-1.5 py-0.5",
                row.targetAmount < 0
                  ? "text-red-600 dark:text-red-400"
                  : row.targetAmount > 0
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {formatCurrency(row.targetAmount, homeCurrency)}
            </span>
          ) : isEditing && !readOnly ? (
            <div className="relative">
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {currencySymbol(homeCurrency)}
              </span>
              <input
                ref={inputRef}
                name={`target_${row.categoryId}`}
                type="number"
                step="10"
                min="0"
                defaultValue={row.targetAmount || ""}
                className="w-full h-7 rounded border bg-background px-1.5 pl-4 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
              />
              {(row.avg3Month > 0 || row.scheduledAmount > 0) && (
                <div className="absolute top-full left-0 right-0 mt-0.5 text-[10px] text-muted-foreground whitespace-nowrap z-10 bg-popover rounded px-1 py-0.5 shadow-sm border">
                  {row.avg3Month > 0 && (
                    <span>
                      Avg: {formatCurrency(row.avg3Month, homeCurrency)}/mo
                    </span>
                  )}
                  {row.avg3Month > 0 && row.scheduledAmount > 0 && (
                    <span> &middot; </span>
                  )}
                  {row.scheduledAmount > 0 && (
                    <span>
                      Recurring:{" "}
                      {formatCurrency(row.scheduledAmount, homeCurrency)}/mo
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !readOnly && onEdit(row.categoryId)}
              className={cn(
                "text-sm tabular-nums px-1.5 py-0.5 rounded transition-colors",
                !readOnly && "hover:bg-muted cursor-pointer",
                row.targetAmount === 0 && "text-muted-foreground",
              )}
              disabled={readOnly}
            >
              {row.targetAmount > 0 ? (
                <span className="flex items-center gap-1 justify-end">
                  {formatCurrency(row.targetAmount, homeCurrency)}
                  {belowScheduled && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Target is below recurring scheduled amount (
                          {formatCurrency(row.scheduledAmount, homeCurrency)}
                          /mo)
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </span>
              ) : (
                <span className="italic">Set target</span>
              )}
            </button>
          )}
        </div>

        {/* Actual spent / allocated */}
        <div className="text-right text-sm tabular-nums">
          {isSynthetic ? (
            <span
              className={
                row.actualSpent < 0
                  ? "text-red-600 dark:text-red-400"
                  : row.actualSpent > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
              }
            >
              {row.actualSpent < 0 ? "−" : ""}
              {formatCurrency(Math.abs(row.actualSpent), homeCurrency)}
            </span>
          ) : row.actualSpent > 0 ? (
            <span
              className={
                row.categoryKind === "savings"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {formatCurrency(row.actualSpent, homeCurrency)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {formatCurrency(0, homeCurrency)}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="hidden sm:block">
          {isSynthetic && row.targetAmount > 0 ? (
            <div className="flex items-center gap-2">
              <BudgetProgressBar
                spent={Math.max(0, row.actualSpent)}
                target={row.targetAmount}
                className="flex-1"
                variant="surplus"
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {pct}%
              </span>
            </div>
          ) : isSynthetic ? (
            <div className="h-2" />
          ) : row.targetAmount > 0 ? (
            <div className="flex items-center gap-2">
              <BudgetProgressBar
                spent={row.actualSpent}
                target={row.targetAmount}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {pct}%
              </span>
            </div>
          ) : (
            <div className="h-2" />
          )}
        </div>

        {/* Remaining */}
        <div className="text-right text-sm tabular-nums">
          {isSynthetic ? (
            row.targetAmount !== 0 || row.actualSpent !== 0 ? (
              <span
                className={
                  remaining >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {remaining >= 0 ? "" : "−"}
                {formatCurrency(Math.abs(remaining), homeCurrency)}
              </span>
            ) : (
              <span className="text-muted-foreground">&mdash;</span>
            )
          ) : row.targetAmount > 0 ? (
            <span
              className={
                remaining >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {remaining >= 0 ? "" : "-"}
              {formatCurrency(Math.abs(remaining), homeCurrency)}
            </span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </div>
      </div>

      {expanded && canDrillDown && (
        <div className="mt-1 mb-2 ml-2 sm:ml-8 pl-3 border-l border-muted space-y-1">
          <div className="flex justify-end pb-1">
            <Link
              href={transactionsInRangeUrl({
                from: monthRangeStart,
                to: monthRangeEnd,
                categoryId: row.categoryId,
              })}
              className="text-xs text-primary hover:underline"
            >
              Transactions
            </Link>
          </div>
          {lines.map((t) => {
            const amt = Math.abs(t.signedConverted);
            const txnPct =
              row.actualSpent > 0
                ? Math.round((amt / row.actualSpent) * 100)
                : 0;
            const isInflow = t.signedConverted > 0;
            return (
              <div
                key={t.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-1.5 px-2 rounded bg-muted/25 text-muted-foreground text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="shrink-0 text-xs tabular-nums">
                      {t.date}
                    </span>
                    <span className="truncate text-foreground/90">
                      {t.description}
                    </span>
                  </div>
                  <div className="truncate text-xs">{t.accountName}</div>
                </div>
                <div
                  className={`shrink-0 text-right tabular-nums ${
                    isInflow
                      ? "text-green-600 dark:text-green-400"
                      : "text-foreground"
                  }`}
                >
                  {isInflow ? "+" : "−"}
                  {formatCurrency(amt, homeCurrency)}
                </div>
                <div className="hidden sm:block shrink-0 w-10 text-right text-xs tabular-nums">
                  {txnPct}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BudgetCategoryList({
  rows,
  month,
  readOnly,
  homeCurrency,
  expenseTransactionsByCategory,
  monthRangeStart,
  monthRangeEnd,
}: {
  rows: BudgetCategoryRow[];
  month: string;
  readOnly: boolean;
  homeCurrency: SupportedCurrency;
  expenseTransactionsByCategory?:
    | Record<string, AnalyticsBudgetTransactionLine[]>
    | undefined;
  monthRangeStart: string;
  monthRangeEnd: string;
}) {
  const groups = groupRows(rows);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.group)),
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    () => new Set(),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [, formAction] = useActionState(saveBudgetTargets, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const drilldownContext = expenseTransactionsByCategory != null;
  const headerGrid = drilldownContext ? gridColsDrilldown : gridColsBase;

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleCategoryExpand = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleBlur = () => {
    // Small delay to let the new value be captured
    setTimeout(() => {
      setEditingId(null);
      const form = formRef.current;
      if (form) {
        startTransition(() => {
          const fd = new FormData(form);
          formAction(fd);
        });
      }
    }, 50);
  };

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="month" value={month} />

          {/* Hidden inputs for non-editing rows to preserve their values */}
          {rows
            .filter((row) => !row.isSyntheticSurplus)
            .map((row) =>
              editingId !== row.categoryId ? (
                <input
                  key={row.categoryId}
                  type="hidden"
                  name={`target_${row.categoryId}`}
                  value={row.targetAmount}
                />
              ) : null,
            )}

          {/* Column headers */}
          <div
            className={cn(
              "grid items-center gap-x-2 sm:gap-x-3 px-2 sm:px-3 pb-2 border-b text-xs font-medium text-muted-foreground",
              headerGrid,
            )}
          >
            {drilldownContext ? <div /> : null}
            <div />
            <div>Category</div>
            <div className="text-right">Target</div>
            <div className="text-right">Spent</div>
            <div className="hidden sm:block">Progress</div>
            <div className="text-right">Left</div>
          </div>

          {groups.map(({ group, rows: groupRows }) => {
            const isExpanded = expandedGroups.has(group);
            const groupBudgeted = groupRows.reduce(
              (s, r) => s + r.targetAmount,
              0,
            );
            const groupSpent = groupRows.reduce((s, r) => s + r.actualSpent, 0);

            return (
              <div key={group} className="mt-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-2 w-full px-2 sm:px-3 py-1.5 text-sm font-semibold hover:bg-muted/50 rounded-md transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span title={group} aria-label={group}>
                    <span className="sm:hidden">
                      {budgetCategoryShortTitle(group)}
                    </span>
                    <span className="hidden sm:inline">{group}</span>
                  </span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                    {formatCurrency(groupSpent, homeCurrency)} /{" "}
                    {formatCurrency(groupBudgeted, homeCurrency)}
                  </span>
                </button>

                {isExpanded && (
                  <div>
                    {groupRows.map((row) => (
                      <CategoryRow
                        key={row.categoryId}
                        row={row}
                        editingId={editingId}
                        onEdit={setEditingId}
                        onBlur={handleBlur}
                        readOnly={readOnly}
                        homeCurrency={homeCurrency}
                        expenseTransactionsByCategory={
                          expenseTransactionsByCategory
                        }
                        monthRangeStart={monthRangeStart}
                        monthRangeEnd={monthRangeEnd}
                        expanded={expandedCategories.has(row.categoryId)}
                        onToggleExpand={() =>
                          toggleCategoryExpand(row.categoryId)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </form>
      </CardContent>
    </Card>
  );
}
