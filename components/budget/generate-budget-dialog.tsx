"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyGeneratedBudgetTargets,
  generateBudgetRecommendations,
} from "@/lib/actions/budget-targets";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { budgetCategoryShortTitle, cn, formatCurrency } from "@/lib/utils";
import type { BudgetGenerateRecommendationRow, BudgetSummary } from "@/types";

type Direction = "increase" | "decrease" | "keep" | "new";

const SAVINGS_PARENT_NAME = "Savings & Investing";

function getDirection(
  row: BudgetGenerateRecommendationRow,
  amount: number,
): Direction {
  if (row.currentMonthTarget <= 0) return "new";
  if (amount > row.currentMonthTarget) return "increase";
  if (amount < row.currentMonthTarget) return "decrease";
  return "keep";
}

function directionClasses(direction: Direction): string {
  if (direction === "increase") {
    return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300";
  }
  if (direction === "decrease") {
    return "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300";
  }
  if (direction === "keep") {
    return "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300";
  }
  return "bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-300";
}

function isSavingsRecommendation(
  row: BudgetGenerateRecommendationRow,
): boolean {
  return row.parentName === SAVINGS_PARENT_NAME;
}

function changeLabel(
  row: BudgetGenerateRecommendationRow,
  amount: number,
  homeCurrency: SupportedCurrency,
): string {
  if (row.currentMonthTarget <= 0) {
    return amount > 0 ? "New target" : "No target";
  }

  const delta = amount - row.currentMonthTarget;
  if (Math.abs(delta) < 0.01) return "No change";

  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(delta), homeCurrency)}`;
}

function changeAriaLabel(
  row: BudgetGenerateRecommendationRow,
  amount: number,
  homeCurrency: SupportedCurrency,
): string {
  const current = formatCurrency(row.currentMonthTarget, homeCurrency);
  const next = formatCurrency(amount, homeCurrency);
  const label = changeLabel(row, amount, homeCurrency);
  return `${row.categoryName} target, current ${current}, new ${next}, ${label}`;
}

function BudgetContextMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "spend" | "save" | "guide";
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card/70 px-3 py-2",
        tone === "spend" && "border-red-500/20 bg-red-500/5",
        tone === "save" && "border-emerald-500/20 bg-emerald-500/5",
        tone === "guide" && "border-blue-500/20 bg-blue-500/5",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {detail}
      </p>
    </div>
  );
}

export function GenerateBudgetDialog({
  month,
  open,
  onClose,
  homeCurrency,
  summary,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  homeCurrency: SupportedCurrency;
  summary: BudgetSummary;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BudgetGenerateRecommendationRow[]>([]);
  const [overallNotes, setOverallNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [amounts, setAmounts] = useState<Map<number, number>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [applying, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const result = await generateBudgetRecommendations(month);
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setRows([]);
        setOverallNotes("");
        setSelectedIds(new Set());
        setAmounts(new Map());
        setLoading(false);
        return;
      }

      const recommendations = result.data.recommendations;
      setRows(recommendations);
      setOverallNotes(result.data.overallNotes);
      setSelectedIds(new Set(recommendations.map((row) => row.categoryId)));
      setAmounts(
        new Map(
          recommendations.map((row) => [row.categoryId, row.recommendedTarget]),
        ),
      );
      setExpandedGroups(
        new Set(
          [
            ...new Set(recommendations.map((row) => row.parentName || "Other")),
          ].sort(),
        ),
      );
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [month, open]);

  const selectedTotal = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (!selectedIds.has(row.categoryId)) return sum;
        return sum + (amounts.get(row.categoryId) ?? row.recommendedTarget);
      }, 0),
    [rows, selectedIds, amounts],
  );

  const selectedMix = useMemo(
    () =>
      rows.reduce(
        (totals, row) => {
          if (!selectedIds.has(row.categoryId)) return totals;
          const amount = amounts.get(row.categoryId) ?? row.recommendedTarget;
          if (isSavingsRecommendation(row)) {
            totals.savings += amount;
          } else {
            totals.expenses += amount;
          }
          return totals;
        },
        { expenses: 0, savings: 0 },
      ),
    [rows, selectedIds, amounts],
  );

  const expectedIncomeSplit = useMemo(
    () => ({
      needs: summary.expectedIncome * 0.5,
      wants: summary.expectedIncome * 0.3,
      savings: summary.expectedIncome * 0.2,
    }),
    [summary.expectedIncome],
  );

  const groupedRows = useMemo(() => {
    const groups = new Map<string, BudgetGenerateRecommendationRow[]>();
    for (const row of rows) {
      const key = row.parentName || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(row);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, entries]) => ({
        group,
        rows: [...entries].sort((a, b) =>
          a.categoryName.localeCompare(b.categoryName),
        ),
      }));
  }, [rows]);

  const selectedCount = selectedIds.size;
  const increaseCount = useMemo(
    () =>
      rows.filter((row) => {
        if (!selectedIds.has(row.categoryId)) return false;
        const amount = amounts.get(row.categoryId) ?? row.recommendedTarget;
        return getDirection(row, amount) === "increase";
      }).length,
    [rows, selectedIds, amounts],
  );
  const decreaseCount = useMemo(
    () =>
      rows.filter((row) => {
        if (!selectedIds.has(row.categoryId)) return false;
        const amount = amounts.get(row.categoryId) ?? row.recommendedTarget;
        return getDirection(row, amount) === "decrease";
      }).length,
    [rows, selectedIds, amounts],
  );

  function toggleSelected(categoryId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function setAmount(categoryId: number, value: string) {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) return;
    setAmounts((prev) => new Map(prev).set(categoryId, amount));
  }

  function copyLastMonthTarget(row: BudgetGenerateRecommendationRow) {
    setAmounts((prev) =>
      new Map(prev).set(row.categoryId, row.lastMonthTarget),
    );
    setSelectedIds((prev) => new Set(prev).add(row.categoryId));
  }

  function selectAll() {
    setSelectedIds(new Set(rows.map((row) => row.categoryId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleApplySelected() {
    const entries = rows
      .filter((row) => selectedIds.has(row.categoryId))
      .map((row) => ({
        categoryId: row.categoryId,
        amount: amounts.get(row.categoryId) ?? row.recommendedTarget,
      }));

    startTransition(async () => {
      const result = await applyGeneratedBudgetTargets(month, entries);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-6xl max-h-[85vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Generate Budget
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            Building recommendations by category...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">{overallNotes}</p>
            </div>

            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="generate-budget-context-bar"
            >
              <BudgetContextMetric
                label="50 / 30 / 20 guide"
                value={`Needs ${formatCurrency(expectedIncomeSplit.needs, homeCurrency)}`}
                detail={`Wants ${formatCurrency(expectedIncomeSplit.wants, homeCurrency)} / Savings ${formatCurrency(expectedIncomeSplit.savings, homeCurrency)}`}
                tone="guide"
              />
              <BudgetContextMetric
                label="Expenses"
                value={`${formatCurrency(selectedMix.expenses, homeCurrency)} proposed`}
                detail={`Current ${formatCurrency(summary.totalBudgeted, homeCurrency)}`}
                tone="spend"
              />
              <BudgetContextMetric
                label="Savings"
                value={`${formatCurrency(selectedMix.savings, homeCurrency)} proposed`}
                detail={`Current ${formatCurrency(summary.totalSavingsBudgeted, homeCurrency)}`}
                tone="save"
              />
              <BudgetContextMetric
                label="Expected income"
                value={formatCurrency(summary.expectedIncome, homeCurrency)}
                detail="Source for guide split"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">
                  Selected categories
                </p>
                <p className="text-lg font-semibold">
                  {selectedCount} / {rows.length}
                </p>
              </div>
              <div className="rounded-lg border bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Budget increases
                </p>
                <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                  {increaseCount}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Budget decreases
                </p>
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {decreaseCount}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Grouped by main category
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1 border rounded-md">
              {groupedRows.map((group) => {
                const groupSelected = group.rows.filter((row) =>
                  selectedIds.has(row.categoryId),
                );
                const groupTotal = groupSelected.reduce((sum, row) => {
                  return (
                    sum + (amounts.get(row.categoryId) ?? row.recommendedTarget)
                  );
                }, 0);
                const groupCurrentTotal = group.rows.reduce(
                  (sum, row) => sum + row.currentMonthTarget,
                  0,
                );
                const groupLastSpentTotal = group.rows.reduce(
                  (sum, row) => sum + row.lastMonthSpent,
                  0,
                );
                const groupAverageTotal = group.rows.reduce(
                  (sum, row) => sum + row.avg3Month,
                  0,
                );
                const groupLastTargetTotal = group.rows.reduce(
                  (sum, row) => sum + row.lastMonthTarget,
                  0,
                );
                const isExpanded = expandedGroups.has(group.group);

                return (
                  <div key={group.group} className="mt-2 first:mt-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      className="w-full flex flex-col gap-2 px-2 py-2 text-left text-sm hover:bg-muted/50 rounded-md transition-colors bg-muted/20 sm:px-3"
                      data-testid="generate-budget-group-summary"
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <p className="truncate font-semibold">
                            {group.group}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
                          {groupSelected.length}/{group.rows.length} selected
                        </p>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-1 text-[11px] font-normal text-muted-foreground tabular-nums sm:grid-cols-5">
                        <span>
                          Proposed{" "}
                          <strong className="font-semibold text-foreground">
                            {formatCurrency(groupTotal, homeCurrency)}
                          </strong>
                        </span>
                        <span>
                          Current{" "}
                          <strong className="font-semibold text-foreground">
                            {formatCurrency(groupCurrentTotal, homeCurrency)}
                          </strong>
                        </span>
                        <span>
                          Last spent{" "}
                          <strong className="font-semibold text-foreground">
                            {formatCurrency(groupLastSpentTotal, homeCurrency)}
                          </strong>
                        </span>
                        <span>
                          3M avg{" "}
                          <strong className="font-semibold text-foreground">
                            {formatCurrency(groupAverageTotal, homeCurrency)}
                          </strong>
                        </span>
                        <span>
                          Prev target{" "}
                          <strong className="font-semibold text-foreground">
                            {formatCurrency(groupLastTargetTotal, homeCurrency)}
                          </strong>
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Apply</TableHead>
                            <TableHead>Subcategory</TableHead>
                            <TableHead className="min-w-[260px]">
                              Signals
                            </TableHead>
                            <TableHead className="min-w-[260px] text-right">
                              Target change
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((row) => {
                            const selected = selectedIds.has(row.categoryId);
                            const currentAmount =
                              amounts.get(row.categoryId) ??
                              row.recommendedTarget;
                            const direction = getDirection(row, currentAmount);
                            const deltaLabel = changeLabel(
                              row,
                              currentAmount,
                              homeCurrency,
                            );
                            const inputId = `generated-target-${row.categoryId}`;
                            return (
                              <TableRow key={row.categoryId}>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant={selected ? "default" : "outline"}
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      toggleSelected(row.categoryId)
                                    }
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                                <TableCell>
                                  <div className="min-w-[220px]">
                                    <p className="font-medium text-sm flex items-center gap-2">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: row.color }}
                                      />
                                      <span className="sm:hidden">
                                        {budgetCategoryShortTitle(
                                          row.categoryName,
                                        )}
                                      </span>
                                      <span className="hidden sm:inline">
                                        {row.categoryName}
                                      </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {row.aiInsight}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
                                    <span className="text-muted-foreground">
                                      Previous month target
                                    </span>
                                    <span className="flex items-center justify-end gap-2 text-right tabular-nums">
                                      <span>
                                        {formatCurrency(
                                          row.lastMonthTarget,
                                          homeCurrency,
                                        )}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px]"
                                        aria-label={`Use last month target for ${row.categoryName}`}
                                        data-testid="copy-last-month-target"
                                        data-last-month-target={
                                          row.lastMonthTarget
                                        }
                                        title={`Use ${formatCurrency(row.lastMonthTarget, homeCurrency)} from last month`}
                                        onClick={() => copyLastMonthTarget(row)}
                                      >
                                        <Copy className="mr-1 h-3 w-3" />
                                        Use last
                                      </Button>
                                    </span>
                                    <span className="text-muted-foreground">
                                      Last spent
                                    </span>
                                    <span className="text-right tabular-nums text-red-600 dark:text-red-400">
                                      {formatCurrency(
                                        row.lastMonthSpent,
                                        homeCurrency,
                                      )}
                                    </span>
                                    <span className="text-muted-foreground">
                                      3M avg
                                    </span>
                                    <span className="text-right tabular-nums">
                                      {formatCurrency(
                                        row.avg3Month,
                                        homeCurrency,
                                      )}
                                    </span>
                                    <span className="text-muted-foreground">
                                      Expected
                                    </span>
                                    <span className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                                      {formatCurrency(
                                        row.expectedSpend,
                                        homeCurrency,
                                      )}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <div className="flex items-end justify-end gap-2">
                                      <div>
                                        <p className="text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
                                          Current
                                        </p>
                                        <p className="rounded-md border bg-muted/30 px-2 py-1 text-sm font-semibold tabular-nums">
                                          {formatCurrency(
                                            row.currentMonthTarget,
                                            homeCurrency,
                                          )}
                                        </p>
                                      </div>
                                      <span className="pb-1.5 text-xs text-muted-foreground">
                                        -&gt;
                                      </span>
                                      <label
                                        htmlFor={inputId}
                                        className="block"
                                      >
                                        <span className="block text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
                                          New
                                        </span>
                                        <Input
                                          id={inputId}
                                          aria-label={changeAriaLabel(
                                            row,
                                            currentAmount,
                                            homeCurrency,
                                          )}
                                          type="number"
                                          min={0}
                                          step={10}
                                          value={currentAmount}
                                          onChange={(event) =>
                                            setAmount(
                                              row.categoryId,
                                              event.target.value,
                                            )
                                          }
                                          className="h-8 w-24 text-right sm:w-28"
                                        />
                                      </label>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "justify-center min-w-20",
                                        directionClasses(direction),
                                      )}
                                    >
                                      {deltaLabel}
                                    </Badge>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-sm">
                Selected total:{" "}
                <span className="font-semibold">
                  {formatCurrency(selectedTotal, homeCurrency)}
                </span>
              </p>
              <Button
                onClick={handleApplySelected}
                disabled={selectedIds.size === 0 || applying}
              >
                {applying ? "Applying..." : "Apply Selected"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
