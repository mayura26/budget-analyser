"use client";

import { useEffect, useState, useTransition } from "react";
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
  previewUnverifiedMatchesForRules,
} from "@/lib/actions/categories";
import type { Category } from "@/types";

export function CreateRuleDialog({
  open,
  onClose,
  description,
  categories,
  categoryMains,
}: {
  open: boolean;
  onClose: () => void;
  description: string;
  categories: Category[];
  categoryMains?: Category[];
}) {
  const [pattern, setPattern] = useState(description);
  const [patternType, setPatternType] = useState<"keyword" | "exact" | "regex">(
    "keyword",
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [previewCount, setPreviewCount] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Reset state whenever dialog opens with new description
  useEffect(() => {
    if (open) {
      setPattern(description);
      setPatternType("keyword");
      setCategoryId(null);
      setPreviewCount(undefined);
      setError("");
    }
  }, [open, description]);

  const mains = categoryMains ?? categories.filter((c) => c.parentId === null);
  const subs = categories.filter((c) => c.parentId !== null);
  const selectedCat = categoryId ? categories.find((c) => c.id === categoryId) : null;

  function handlePreview() {
    if (!pattern.trim() || categoryId === null) return;
    startTransition(async () => {
      const result = await previewUnverifiedMatchesForRules([
        { pattern: pattern.trim(), categoryId, patternType },
      ]);
      if (result.success && result.data.length > 0) {
        setPreviewCount(result.data[0].count);
      }
    });
  }

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
          {/* Pattern + type on one row */}
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

          {/* Category + preview inline */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex gap-2">
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
                  className="flex-1"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 text-xs px-3"
                disabled={isPending || !pattern.trim() || categoryId === null}
                onClick={handlePreview}
              >
                Preview
              </Button>
            </div>

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
              className="flex-1"
              disabled={isPending || !pattern.trim() || categoryId === null}
              onClick={handleSave}
              data-testid="create-rule-save"
            >
              Save rule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
