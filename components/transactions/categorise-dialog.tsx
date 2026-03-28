"use client";

import { AlertCircle, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { CategorySelectGrouped } from "@/components/categories/category-select-grouped";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createRulesBulk } from "@/lib/actions/categories";
import type { SuggestionRow } from "@/lib/actions/transactions";
import {
  applyCategorisations,
  getAISuggestions,
} from "@/lib/actions/transactions";
import type { SuggestedRule } from "@/lib/categorisation/rule-suggester";
import { computeSuggestedRules } from "@/lib/categorisation/rule-suggester";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Category } from "@/types";

type DialogState =
  | "idle"
  | "loading"
  | "review"
  | "applying"
  | "suggestedRules"
  | "done"
  | "error";

export function CategoriseDialog({
  uncategorisedCount,
  categories,
  categoryMains,
}: {
  uncategorisedCount: number;
  categories: Category[];
  categoryMains?: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState>("idle");
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [selections, setSelections] = useState<Record<number, number | null>>(
    {},
  );
  const [appliedCount, setAppliedCount] = useState(0);
  const [suggestedRules, setSuggestedRules] = useState<SuggestedRule[]>([]);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setState("loading");
    setSuggestions([]);
    setSelections({});
    setErrorMsg("");

    startTransition(async () => {
      const result = await getAISuggestions();
      if (!result.success) {
        setErrorMsg(result.error);
        setState("error");
        return;
      }
      const rows = result.data;
      setSuggestions(rows);
      const initial: Record<number, number | null> = {};
      for (const row of rows) {
        initial[row.transactionId] = row.suggestedCategoryId;
      }
      setSelections(initial);
      setState("review");
    });
  }

  function handleCategoryChange(transactionId: number, value: string) {
    setSelections((prev) => ({
      ...prev,
      [transactionId]: value === "none" ? null : parseInt(value, 10),
    }));
  }

  function handleApply() {
    const updates = suggestions
      .filter((s) => selections[s.transactionId] != null)
      .map((s) => {
        const categoryId = selections[s.transactionId];
        if (categoryId == null) {
          throw new Error("selection invariant");
        }
        return {
          transactionId: s.transactionId,
          categoryId,
          source: s.source,
        };
      });

    if (updates.length === 0) return;

    setState("applying");
    startTransition(async () => {
      const result = await applyCategorisations(updates);
      if (!result.success) {
        setErrorMsg(result.error);
        setState("error");
        return;
      }
      setAppliedCount(result.data.applied);

      // Compute rule suggestions from applied categorisations
      const categoryMap = new Map(categories.map((c) => [c.id, c]));
      const transferIds = new Set(
        categories.filter((c) => c.type === "transfer").map((c) => c.id),
      );

      const applied = updates.map((u) => {
        const row = suggestions.find(
          (s) => s.transactionId === u.transactionId,
        );
        if (!row) {
          throw new Error("suggestion invariant");
        }
        return {
          normalised: row.normalised,
          categoryId: u.categoryId,
          categoryName: categoryMap.get(u.categoryId)?.name ?? "Unknown",
        };
      });

      const rules = computeSuggestedRules(applied, transferIds);

      if (rules.length > 0) {
        setSuggestedRules(rules);
        // Pre-select all suggested rules
        setSelectedRules(
          new Set(rules.map((r) => `${r.pattern}::${r.categoryId}`)),
        );
        setState("suggestedRules");
      } else {
        setState("done");
      }
    });
  }

  function toggleRule(key: string) {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCreateRules() {
    const toCreate = suggestedRules
      .filter((r) => selectedRules.has(`${r.pattern}::${r.categoryId}`))
      .map((r) => ({ pattern: r.pattern, categoryId: r.categoryId }));

    startTransition(async () => {
      await createRulesBulk(toCreate);
      setState("done");
    });
  }

  const selectedCount = Object.values(selections).filter(
    (v) => v != null,
  ).length;
  const selectedRuleCount = selectedRules.size;

  const sourceLabel = (source: SuggestionRow["source"]) => {
    if (source === "ai")
      return (
        <Badge className="text-xs bg-blue-100 text-blue-800 border-0">AI</Badge>
      );
    if (source === "rule")
      return (
        <Badge className="text-xs bg-purple-100 text-purple-800 border-0">
          Rule
        </Badge>
      );
    return null;
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Sparkles className="h-4 w-4 mr-2" />
        Categorise {uncategorisedCount} uncategorised
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!isPending) setOpen(v);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>AI Categorisation</DialogTitle>
            <DialogDescription>
              {state === "loading" && "Asking AI to suggest categories…"}
              {state === "review" &&
                `${suggestions.length} transactions — review and adjust before applying.`}
              {state === "applying" && "Applying categories…"}
              {state === "suggestedRules" &&
                `${appliedCount} categories applied — create rules for future imports?`}
              {state === "done" && `${appliedCount} transactions categorised.`}
              {state === "error" && errorMsg}
            </DialogDescription>
          </DialogHeader>

          {/* Loading */}
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Processing {uncategorisedCount} transactions…
              </p>
            </div>
          )}

          {/* Review table */}
          {state === "review" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-1 border-b bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="w-[11%] px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Date
                    </th>
                    <th className="w-[32%] min-w-0 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="w-[14%] min-w-0 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Account
                    </th>
                    <th className="w-[12%] px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Amount
                    </th>
                    <th className="w-[23%] min-w-0 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Category
                    </th>
                    <th className="w-[8%] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((row) => (
                    <tr
                      key={row.transactionId}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-middle">
                        {formatDate(row.date)}
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="truncate cursor-default">
                                {row.description}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              {row.description}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <p className="truncate text-muted-foreground text-xs">
                          {row.accountName}
                        </p>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium whitespace-nowrap align-middle ${row.amount < 0 ? "text-red-600" : "text-green-600"}`}
                      >
                        {row.amount < 0 ? "-" : "+"}
                        {formatCurrency(Math.abs(row.amount))}
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <Select
                          value={
                            selections[row.transactionId] != null
                              ? String(selections[row.transactionId])
                              : "none"
                          }
                          onValueChange={(v) =>
                            handleCategoryChange(row.transactionId, v)
                          }
                        >
                          <SelectTrigger className="h-7 w-full min-w-0 text-xs">
                            <SelectValue placeholder="Pick category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">
                                Not processed
                              </span>
                            </SelectItem>
                            {categoryMains && categoryMains.length > 0 ? (
                              <CategorySelectGrouped
                                categories={categories}
                                mains={categoryMains}
                              />
                            ) : (
                              categories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  <CategoryNameParts
                                    name={c.name}
                                    variant="select"
                                  />
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {sourceLabel(row.source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Applying */}
          {state === "applying" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Saving {selectedCount} categories…
              </p>
            </div>
          )}

          {/* Suggested rules */}
          {state === "suggestedRules" && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden">
              <p className="text-sm text-muted-foreground">
                These rules will auto-categorise matching transactions on future
                imports:
              </p>
              <div className="rounded-md border divide-y">
                {suggestedRules.map((rule) => {
                  const key = `${rule.pattern}::${rule.categoryId}`;
                  const checked = selectedRules.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRule(key)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="font-mono text-sm font-medium">
                        "{rule.pattern}"
                      </span>
                      <span className="text-muted-foreground text-sm">→</span>
                      <span className="text-sm min-w-0">
                        <CategoryNameParts
                          name={rule.categoryName}
                          variant="list"
                        />
                      </span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {rule.matchCount} transaction
                        {rule.matchCount !== 1 ? "s" : ""}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-base font-semibold">
                {appliedCount} transactions categorised
              </p>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">{errorMsg}</p>
              <p className="text-xs text-muted-foreground">
                Make sure <code>OPENAI_API_KEY</code> is set in your
                environment.
              </p>
            </div>
          )}

          <DialogFooter className="shrink-0">
            {state === "review" && (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={selectedCount === 0 || isPending}
                >
                  Apply {selectedCount} suggestion
                  {selectedCount !== 1 ? "s" : ""}
                </Button>
              </>
            )}
            {state === "suggestedRules" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setState("done")}
                  disabled={isPending}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleCreateRules}
                  disabled={selectedRuleCount === 0 || isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    `Create ${selectedRuleCount} rule${selectedRuleCount !== 1 ? "s" : ""}`
                  )}
                </Button>
              </>
            )}
            {state === "done" && (
              <Button onClick={() => setOpen(false)}>Close</Button>
            )}
            {state === "error" && (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
