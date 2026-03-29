"use client";

import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
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
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, currencySymbol, formatCurrency } from "@/lib/utils";
import type { BudgetCategoryRow } from "@/types";

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

function CategoryRow({
  row,
  editingId,
  onEdit,
  onBlur,
  readOnly,
  homeCurrency,
}: {
  row: BudgetCategoryRow;
  editingId: number | null;
  onEdit: (id: number) => void;
  onBlur: () => void;
  readOnly: boolean;
  homeCurrency: SupportedCurrency;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingId === row.categoryId;
  const pct =
    row.targetAmount > 0
      ? Math.round((row.actualSpent / row.targetAmount) * 100)
      : 0;
  const remaining = row.targetAmount - row.actualSpent;
  const belowScheduled =
    row.targetAmount > 0 && row.targetAmount < row.scheduledAmount;

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_1fr_auto] sm:grid-cols-[auto_1fr_7rem_7rem_minmax(6rem,1fr)_6rem] items-center gap-x-2 sm:gap-x-3 py-2 px-2 sm:px-3 hover:bg-muted/50 rounded-md transition-colors">
      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: row.color }}
      />

      {/* Category name */}
      <div className="min-w-0 truncate text-sm">{row.categoryName}</div>

      {/* Target (editable) */}
      <div className="text-right">
        {isEditing && !readOnly ? (
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
                        {formatCurrency(row.scheduledAmount, homeCurrency)}/mo)
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

      {/* Actual spent */}
      <div className="text-right text-sm tabular-nums">
        {row.actualSpent > 0 ? (
          <span className="text-red-600 dark:text-red-400">
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
        {row.targetAmount > 0 ? (
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
        {row.targetAmount > 0 ? (
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
  );
}

export function BudgetCategoryList({
  rows,
  month,
  readOnly,
  homeCurrency,
}: {
  rows: BudgetCategoryRow[];
  month: string;
  readOnly: boolean;
  homeCurrency: SupportedCurrency;
}) {
  const groups = groupRows(rows);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.group)),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [, formAction] = useActionState(saveBudgetTargets, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
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
          {rows.map((row) =>
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
          <div className="grid grid-cols-[auto_1fr_auto_auto_1fr_auto] sm:grid-cols-[auto_1fr_7rem_7rem_minmax(6rem,1fr)_6rem] items-center gap-x-2 sm:gap-x-3 px-2 sm:px-3 pb-2 border-b text-xs font-medium text-muted-foreground">
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
                  <span>{group}</span>
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
