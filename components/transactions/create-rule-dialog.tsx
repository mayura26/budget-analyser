"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { CategorySelectGrouped } from "@/components/categories/category-select-grouped";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRulesFromDrafts,
  createRulesFromDraftsAndApplyToUnverified,
  getMatchingRulesForTransaction,
  previewUnverifiedMatchesForRules,
  type MatchingRuleInfo,
} from "@/lib/actions/categories";
import { parseCategoryDisplayName } from "@/lib/categories/display-name";
import type { Category } from "@/types";

export function CreateRuleDialog({
  open,
  onClose,
  description,
  normalised,
  categories,
  categoryMains,
}: {
  open: boolean;
  onClose: () => void;
  description: string;
  normalised: string;
  categories: Category[];
  categoryMains?: Category[];
}) {
  const [pattern, setPattern] = useState("");
  const [patternType, setPatternType] = useState<"keyword" | "exact" | "regex">("keyword");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [previewCount, setPreviewCount] = useState<number | undefined>(undefined);
  const [matchingRules, setMatchingRules] = useState<MatchingRuleInfo[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset and load matching rules whenever dialog opens
  useEffect(() => {
    if (!open) return;
    setPattern("");
    setPatternType("keyword");
    setCategoryId(null);
    setPreviewCount(undefined);
    setError("");
    setMatchingRules([]);

    if (!normalised) return;
    setLoadingRules(true);
    getMatchingRulesForTransaction(normalised).then((result) => {
      setLoadingRules(false);
      if (result.success) setMatchingRules(result.data);
    });
  }, [open, normalised]);

  // Auto-preview whenever pattern or category changes (debounced)
  useEffect(() => {
    if (!pattern.trim() || categoryId === null) {
      setPreviewCount(undefined);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      previewUnverifiedMatchesForRules([
        { pattern: pattern.trim(), categoryId, patternType },
      ]).then((result) => {
        if (result.success && result.data.length > 0) {
          setPreviewCount(result.data[0].count);
        }
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pattern, categoryId, patternType]);

  const mains = categoryMains ?? categories.filter((c) => c.parentId === null);
  const subs = categories.filter((c) => c.parentId !== null);
  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null;

  const tokens = normalised
    ? [...new Set(normalised.split(/\s+/).filter((t) => t.length > 1))]
    : [];

  function handleSave() {
    if (!pattern.trim() || categoryId === null) return;
    setError("");
    startTransition(async () => {
      const result = await createRulesFromDrafts([
        { pattern: pattern.trim(), categoryId, patternType },
      ]);
      if (!result.success) {
        setError(result.error ?? "Failed to save rule");
        return;
      }
      onClose();
    });
  }

  function handleSaveAndApply() {
    if (!pattern.trim() || categoryId === null) return;
    setError("");
    startTransition(async () => {
      const result = await createRulesFromDraftsAndApplyToUnverified([
        { pattern: pattern.trim(), categoryId, patternType },
      ]);
      if (!result.success) {
        setError(result.error ?? "Failed to save rule");
        return;
      }
      onClose();
    });
  }

  const patternTypeDescriptions: Record<string, string> = {
    keyword: "matches if description contains this text",
    exact: "matches only if description is exactly this text",
    regex: "matches using a regular expression pattern",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" aria-describedby="create-rule-desc">
        <DialogHeader>
          <DialogTitle>Create matching rule</DialogTitle>
          <DialogDescription id="create-rule-desc">
            Save a rule to automatically categorise similar transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Transaction description */}
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground font-mono break-all">
            {description}
          </div>

          {/* Token chips */}
          {tokens.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Click a token to use as pattern:</p>
              <div className="flex flex-wrap gap-1.5">
                {tokens.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => {
                      setPattern(token);
                      setPatternType("keyword");
                      setPreviewCount(undefined);
                    }}
                    className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                      pattern === token && patternType === "keyword"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
                    }`}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matching rules diagnostic */}
          {(loadingRules || matchingRules.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Rules currently matching this transaction:
              </p>
              {loadingRules ? (
                <p className="text-xs text-muted-foreground italic">Loading…</p>
              ) : (
                <div className="space-y-1">
                  {matchingRules.map((r, i) => (
                    <div
                      key={r.ruleId}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                        i === 0
                          ? "bg-amber-500/10 border border-amber-500/25"
                          : "bg-muted/40 border border-border"
                      }`}
                    >
                      <span className="shrink-0 font-mono text-muted-foreground">{r.patternType}</span>
                      <span className="font-mono flex-1 truncate" title={r.pattern}>
                        &quot;{r.pattern}&quot;
                      </span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span
                        className="shrink-0 font-medium truncate max-w-[6rem]"
                        style={{ color: r.categoryColor }}
                        title={parseCategoryDisplayName(r.categoryName).title}
                      >
                        {parseCategoryDisplayName(r.categoryName).title}
                      </span>
                      {i === 0 && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px] h-4 px-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                        >
                          wins
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loadingRules && matchingRules.length === 0 && normalised && (
            <p className="text-xs text-muted-foreground">
              No rules currently match this transaction.
            </p>
          )}

          {/* Pattern + type */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-pattern">Pattern</Label>
            <div className="flex gap-2">
              <select
                id="cr-patternType"
                value={patternType}
                onChange={(e) => {
                  setPatternType(e.target.value as typeof patternType);
                  setPreviewCount(undefined);
                }}
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-sm shrink-0 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="keyword">keyword</option>
                <option value="exact">exact</option>
                <option value="regex">regex</option>
              </select>
              <Input
                id="cr-pattern"
                data-testid="create-rule-pattern"
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setPreviewCount(undefined);
                }}
                placeholder="e.g. WOOLWORTHS"
                className="font-mono flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {patternTypeDescriptions[patternType]}
            </p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={categoryId !== null ? String(categoryId) : ""}
              onValueChange={(v) => {
                setCategoryId(Number(v));
                setPreviewCount(undefined);
              }}
            >
              <SelectTrigger
                data-testid="create-rule-category"
                title={selectedCat?.name ?? undefined}
              >
                <span className="truncate">
                  {selectedCat ? (
                    <CategoryNameParts name={selectedCat.name} variant="select" />
                  ) : (
                    <span className="text-muted-foreground">Choose category…</span>
                  )}
                </span>
              </SelectTrigger>
              <SelectContent>
                <CategorySelectGrouped categories={subs} mains={mains} />
              </SelectContent>
            </Select>

            {previewCount !== undefined && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    previewCount > 0
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-muted text-muted-foreground border border-border"
                  }
                >
                  {previewCount} unverified match{previewCount === 1 ? "" : "es"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {previewCount > 0
                    ? "would be re-categorised"
                    : "no pending transactions match"}
                </span>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className="shrink-0"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs"
              disabled={isPending || !pattern.trim() || categoryId === null}
              onClick={handleSave}
              data-testid="create-rule-save"
            >
              Save rule
            </Button>
            <Button
              type="button"
              className="flex-1 text-xs"
              disabled={isPending || !pattern.trim() || categoryId === null}
              onClick={handleSaveAndApply}
              data-testid="create-rule-save-apply"
            >
              Save &amp; apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
