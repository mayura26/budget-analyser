"use client";

import { Check, ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
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
import type { BudgetGenerateRecommendationRow } from "@/types";

type Direction = "increase" | "decrease" | "keep" | "new";

function getDirection(row: BudgetGenerateRecommendationRow, amount: number): Direction {
  if (row.currentMonthTarget <= 0) return "new";
  if (amount > row.currentMonthTarget) return "increase";
  if (amount < row.currentMonthTarget) return "decrease";
  return "keep";
}

function directionLabel(direction: Direction): string {
  if (direction === "increase") return "Increase";
  if (direction === "decrease") return "Decrease";
  if (direction === "keep") return "Keep";
  return "New";
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

export function GenerateBudgetDialog({
  month,
  open,
  onClose,
  homeCurrency,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  homeCurrency: SupportedCurrency;
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
          [...new Set(recommendations.map((row) => row.parentName || "Other"))].sort(),
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
        const amount = amounts.get(row.categoryId) ?? row.recommendedTarget;
        return getDirection(row, amount) === "increase";
      }).length,
    [rows, amounts],
  );
  const decreaseCount = useMemo(
    () =>
      rows.filter((row) => {
        const amount = amounts.get(row.categoryId) ?? row.recommendedTarget;
        return getDirection(row, amount) === "decrease";
      }).length,
    [rows, amounts],
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Selected categories</p>
                <p className="text-lg font-semibold">
                  {selectedCount} / {rows.length}
                </p>
              </div>
              <div className="rounded-lg border bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">Budget increases</p>
                <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                  {increaseCount}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <p className="text-xs text-muted-foreground">Budget decreases</p>
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
                  return sum + (amounts.get(row.categoryId) ?? row.recommendedTarget);
                }, 0);
                const isExpanded = expandedGroups.has(group.group);

                return (
                  <div key={group.group} className="mt-2 first:mt-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      className="w-full flex items-center justify-between px-2 sm:px-3 py-2 text-sm font-semibold hover:bg-muted/50 rounded-md transition-colors bg-muted/20"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <p className="font-semibold">{group.group}</p>
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {groupSelected.length}/{group.rows.length} selected ·{" "}
                        {formatCurrency(groupTotal, homeCurrency)}
                      </p>
                    </button>

                    {isExpanded && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Apply</TableHead>
                            <TableHead>Subcategory</TableHead>
                            <TableHead className="min-w-[260px]">Signals</TableHead>
                            <TableHead className="text-right">New target</TableHead>
                            <TableHead className="text-right">Direction</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((row) => {
                            const selected = selectedIds.has(row.categoryId);
                            const currentAmount =
                              amounts.get(row.categoryId) ?? row.recommendedTarget;
                            const direction = getDirection(row, currentAmount);
                            return (
                              <TableRow key={row.categoryId}>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant={selected ? "default" : "outline"}
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() => toggleSelected(row.categoryId)}
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
                                        {budgetCategoryShortTitle(row.categoryName)}
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
                                    <span className="text-muted-foreground">Last target</span>
                                    <span className="text-right tabular-nums">
                                      {formatCurrency(row.lastMonthTarget, homeCurrency)}
                                    </span>
                                    <span className="text-muted-foreground">Last spent</span>
                                    <span className="text-right tabular-nums text-red-600 dark:text-red-400">
                                      {formatCurrency(row.lastMonthSpent, homeCurrency)}
                                    </span>
                                    <span className="text-muted-foreground">3M avg</span>
                                    <span className="text-right tabular-nums">
                                      {formatCurrency(row.avg3Month, homeCurrency)}
                                    </span>
                                    <span className="text-muted-foreground">Expected</span>
                                    <span className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                                      {formatCurrency(row.expectedSpend, homeCurrency)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={10}
                                    value={currentAmount}
                                    onChange={(event) =>
                                      setAmount(row.categoryId, event.target.value)
                                    }
                                    className="h-8 w-24 sm:w-28 ml-auto text-right"
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "justify-center min-w-16 sm:min-w-20",
                                      directionClasses(direction),
                                    )}
                                  >
                                    {directionLabel(direction)}
                                  </Badge>
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
