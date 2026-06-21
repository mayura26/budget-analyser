"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  BudgetProgressBar,
  getBudgetStatus,
  statusTextClass,
} from "@/components/budget/budget-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** Savings "Left": ahead of target = positive + green; under target = red shortfall. */
function savingsRemainingDisplay(
  row: BudgetCategoryRow,
  homeCurrency: SupportedCurrency,
) {
  const ahead = row.actualSpent - row.targetAmount;
  if (ahead >= -0.005) {
    const v = ahead <= 0.005 ? 0 : ahead;
    return (
      <span className="text-emerald-600 dark:text-emerald-400">
        {v > 0 ? "+" : ""}
        {formatCurrency(v, homeCurrency)}
      </span>
    );
  }
  const short = row.targetAmount - row.actualSpent;
  return (
    <span className="text-red-600 dark:text-red-400">
      {formatCurrency(short, homeCurrency)}
    </span>
  );
}

function syntheticSurplusRemainingDisplay(
  row: BudgetCategoryRow,
  homeCurrency: SupportedCurrency,
) {
  if (row.actualSpent < -0.005) {
    return (
      <span className="text-red-600 dark:text-red-400">
        Deficit {formatCurrency(Math.abs(row.actualSpent), homeCurrency)}
      </span>
    );
  }

  if (row.targetAmount > 0) {
    const ahead = row.actualSpent - row.targetAmount;
    if (ahead >= -0.005) {
      return (
        <span className="text-emerald-600 dark:text-emerald-400">
          {ahead > 0.005 ? "+" : ""}
          {formatCurrency(Math.max(0, ahead), homeCurrency)}
        </span>
      );
    }

    return (
      <span className="text-red-600 dark:text-red-400">
        {formatCurrency(row.targetAmount - row.actualSpent, homeCurrency)}
      </span>
    );
  }

  if (row.actualSpent > 0.005) {
    return (
      <span className="text-emerald-600 dark:text-emerald-400">
        +{formatCurrency(row.actualSpent, homeCurrency)}
      </span>
    );
  }

  return <span className="text-muted-foreground">&mdash;</span>;
}

function renderRemaining(
  row: BudgetCategoryRow,
  homeCurrency: SupportedCurrency,
) {
  const isSynthetic = row.isSyntheticSurplus === true;
  if (isSynthetic) return syntheticSurplusRemainingDisplay(row, homeCurrency);
  if (row.categoryKind === "savings" && row.targetAmount > 0) {
    return savingsRemainingDisplay(row, homeCurrency);
  }
  if (row.targetAmount > 0) {
    const remaining = row.targetAmount - row.actualSpent;
    return (
      <span
        className={
          remaining >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }
      >
        {remaining >= 0 ? "" : "−"}
        {formatCurrency(Math.abs(remaining), homeCurrency)}
      </span>
    );
  }
  return <span className="text-muted-foreground">&mdash;</span>;
}

function formatScheduleDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function formatScheduleDates(dates: string[]) {
  const visible = dates.slice(0, 3).map(formatScheduleDate).join(", ");
  const extra = dates.length > 3 ? ` +${dates.length - 3} more` : "";
  return `${visible}${extra}`;
}

function scheduleFrequencyLabel(
  frequency: BudgetCategoryRow["scheduledBreakdown"][number]["frequency"],
) {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "fortnightly":
      return "Fortnightly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
  }
}

function RecurringSchedulePopover({
  row,
  homeCurrency,
}: {
  row: BudgetCategoryRow;
  homeCurrency: SupportedCurrency;
}) {
  const shortfall = Math.max(0, row.scheduledAmount - row.targetAmount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-0.5 text-amber-500 transition-colors hover:bg-amber-500/10 hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Show recurring scheduled costs for ${row.categoryName}`}
          data-testid={`recurring-breakdown-trigger-${row.categoryId}`}
        >
          <AlertTriangle className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        align="end"
      >
        <div className="border-b bg-muted/40 px-3 py-2">
          <p className="text-sm font-semibold tracking-tight">
            Recurring scheduled costs
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {row.categoryName}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-xs">
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="font-mono tabular-nums text-foreground">
              {formatCurrency(row.targetAmount, homeCurrency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Recurring</p>
            <p className="font-mono tabular-nums text-foreground">
              {formatCurrency(row.scheduledAmount, homeCurrency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Shortfall</p>
            <p className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {formatCurrency(shortfall, homeCurrency)}
            </p>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto px-3 py-2.5">
          {row.scheduledBreakdown.length > 0 ? (
            <div className="space-y-2">
              {row.scheduledBreakdown.map((item) => (
                <div
                  key={item.scheduleId}
                  className="rounded-md border bg-background px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {scheduleFrequencyLabel(item.frequency)}
                        {item.occurrenceCount > 1
                          ? `, ${item.occurrenceCount}x this month`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm tabular-nums">
                      {formatCurrency(item.amount, homeCurrency)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatScheduleDates(item.dates)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No schedule details available.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
const gridColsBase =
  "grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_1fr_minmax(14rem,18rem)_minmax(8rem,1fr)]";
const gridColsDrilldown =
  "grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_auto_1fr_minmax(14rem,18rem)_minmax(8rem,1fr)]";

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
  const barVariant: "default" | "savings" =
    row.categoryKind === "savings" ? "savings" : "default";
  const status = getBudgetStatus(barSpentForPct, row.targetAmount, barVariant);
  const pctLabelClass =
    row.targetAmount > 0 ? statusTextClass(status) : "text-muted-foreground";
  const belowScheduled =
    row.targetAmount > 0 && row.targetAmount < row.scheduledAmount;

  const catKey = String(row.categoryId);
  const lines = expenseTransactionsByCategory?.[catKey] ?? [];
  const drilldownContext = expenseTransactionsByCategory != null;
  const canDrillDown = !isSynthetic && lines.length > 0;

  const gridClass = drilldownContext ? gridColsDrilldown : gridColsBase;

  return (
    <div
      className="rounded-md"
      data-testid={isSynthetic ? undefined : "budget-category-row"}
      data-category-name={isSynthetic ? undefined : row.categoryName}
    >
      <div
        data-testid={isSynthetic ? "budget-row-income-surplus" : undefined}
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
                  <p className="font-medium mb-1">
                    Computed row (not a category)
                  </p>
                  <p>
                    Target: scheduled expected income minus all expense and
                    savings targets. Actual: income basis (max of scheduled and
                    realised) minus expense outflows minus savings transfers —
                    updates as the month progresses.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>

        {/* Merged budget: spent / target · left */}
        <div className="text-right text-sm tabular-nums whitespace-nowrap flex items-center justify-end gap-1.5">
          {/* Spent */}
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
                  : "text-foreground"
              }
            >
              {formatCurrency(row.actualSpent, homeCurrency)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {formatCurrency(0, homeCurrency)}
            </span>
          )}

          <span className="text-muted-foreground/60">/</span>

          {/* Target (editable for non-synthetic) */}
          {isSynthetic ? (
            <span
              className={cn(
                row.targetAmount < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground",
              )}
            >
              {formatCurrency(row.targetAmount, homeCurrency)}
            </span>
          ) : isEditing && !readOnly ? (
            <span className="relative inline-block">
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
                className="w-24 h-7 rounded border bg-background px-1.5 pl-5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
              />
              {(row.avg3Month > 0 || row.scheduledAmount > 0) && (
                <span className="absolute top-full right-0 mt-0.5 text-[10px] text-muted-foreground whitespace-nowrap z-10 bg-popover rounded px-1 py-0.5 shadow-sm border">
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
                </span>
              )}
            </span>
          ) : row.targetAmount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => !readOnly && onEdit(row.categoryId)}
                aria-label={`Edit target for ${row.categoryName}`}
                className={cn(
                  "tabular-nums px-1 py-0.5 rounded transition-colors text-muted-foreground",
                  !readOnly && "hover:bg-muted cursor-pointer",
                )}
                disabled={readOnly}
              >
                {formatCurrency(row.targetAmount, homeCurrency)}
              </button>
              {belowScheduled && (
                <RecurringSchedulePopover
                  row={row}
                  homeCurrency={homeCurrency}
                />
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => !readOnly && onEdit(row.categoryId)}
              aria-label={`Edit target for ${row.categoryName}`}
              className={cn(
                "tabular-nums px-1 py-0.5 rounded transition-colors text-muted-foreground italic",
                !readOnly && "hover:bg-muted cursor-pointer",
              )}
              disabled={readOnly}
            >
              Set target
            </button>
          )}
          {/* Remaining — hidden on mobile to save room */}
          <span className="hidden sm:inline text-muted-foreground/60">·</span>
          <span className="hidden sm:inline min-w-[4.5rem] text-right">
            {renderRemaining(row, homeCurrency)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="hidden sm:block">
          {isSynthetic && row.actualSpent < -0.005 ? (
            <div className="text-xs tabular-nums text-right text-red-600 dark:text-red-400">
              Deficit
            </div>
          ) : row.targetAmount > 0 ? (
            <div className="flex items-center gap-2">
              <BudgetProgressBar
                spent={barSpentForPct}
                target={row.targetAmount}
                className="flex-1"
                variant={barVariant}
                size="sm"
              />
              <span
                className={cn(
                  "text-xs tabular-nums w-9 text-right",
                  pctLabelClass,
                )}
              >
                {pct}%
              </span>
            </div>
          ) : (
            <div className="h-2" />
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
            <div className="text-right">Budget</div>
            <div className="hidden sm:block">Progress</div>
          </div>

          {groups.map(({ group, rows: groupRows }) => {
            const isExpanded = expandedGroups.has(group);
            const groupBudgeted = groupRows.reduce(
              (s, r) => s + r.targetAmount,
              0,
            );
            const rawGroupSpent = groupRows.reduce(
              (s, r) => s + r.actualSpent,
              0,
            );
            const isSavingsGroup = groupRows.some(
              (r) => r.categoryKind === "savings",
            );
            const groupSpent = isSavingsGroup
              ? Math.max(0, rawGroupSpent)
              : rawGroupSpent;

            const groupVariant: "default" | "savings" = isSavingsGroup
              ? "savings"
              : "default";
            const groupStatus = getBudgetStatus(
              groupSpent,
              groupBudgeted,
              groupVariant,
            );
            const groupPct =
              groupBudgeted > 0
                ? Math.round((groupSpent / groupBudgeted) * 100)
                : 0;
            const groupRemaining = groupBudgeted - groupSpent;
            const groupRemainingClass = isSavingsGroup
              ? groupSpent - groupBudgeted >= -0.005
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
              : groupRemaining >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
            const groupRemainingLabel = isSavingsGroup
              ? groupSpent - groupBudgeted >= -0.005
                ? `+${formatCurrency(Math.max(0, groupSpent - groupBudgeted), homeCurrency)}`
                : formatCurrency(groupBudgeted - groupSpent, homeCurrency)
              : `${groupRemaining >= 0 ? "" : "−"}${formatCurrency(Math.abs(groupRemaining), homeCurrency)}`;
            return (
              <div key={group} className="mt-2">
                <div
                  className={cn(
                    "grid items-center gap-x-2 sm:gap-x-3 px-2 sm:px-3 py-1.5 hover:bg-muted/50 rounded-md transition-colors",
                    headerGrid,
                  )}
                >
                  {drilldownContext ? <div /> : null}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="col-span-2 flex items-center gap-2 text-sm font-semibold text-left min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span title={group} className="min-w-0 truncate">
                      <span className="sm:hidden">
                        {budgetCategoryShortTitle(group)}
                      </span>
                      <span className="hidden sm:inline">{group}</span>
                    </span>
                  </button>
                  <div className="text-right text-sm tabular-nums whitespace-nowrap flex items-center justify-end gap-1.5">
                    <span className="text-foreground">
                      {formatCurrency(groupSpent, homeCurrency)}
                    </span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(groupBudgeted, homeCurrency)}
                    </span>
                    <span className="hidden sm:inline text-muted-foreground/60">
                      ·
                    </span>
                    <span
                      className={cn(
                        "hidden sm:inline min-w-[4.5rem] text-right",
                        groupRemainingClass,
                      )}
                    >
                      {groupRemainingLabel}
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    {groupBudgeted > 0 ? (
                      <div className="flex items-center gap-2">
                        <BudgetProgressBar
                          spent={groupSpent}
                          target={groupBudgeted}
                          className="flex-1"
                          variant={groupVariant}
                          size="lg"
                        />
                        <span
                          className={cn(
                            "text-xs tabular-nums w-9 text-right font-medium",
                            statusTextClass(groupStatus),
                          )}
                        >
                          {groupPct}%
                        </span>
                      </div>
                    ) : (
                      <div className="h-3" />
                    )}
                  </div>
                </div>

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
