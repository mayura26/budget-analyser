"use client";

import { useState } from "react";
import { deleteCategory, createCategory, deleteRule, createRule } from "@/lib/actions/categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import type { Category, CategorisationRule } from "@/types";

type CategoryWithCount = Category & { ruleCount: number };

export function CategoryList({
  categories,
  rules,
}: {
  categories: CategoryWithCount[];
  rules: CategorisationRule[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addRuleFor, setAddRuleFor] = useState<number | null>(null);

  const rulesByCategory = rules.reduce<Record<number, CategorisationRule[]>>(
    (acc, rule) => {
      if (!acc[rule.categoryId]) acc[rule.categoryId] = [];
      acc[rule.categoryId].push(rule);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddCategoryDialog />
      </div>

      <div className="space-y-2">
        {categories.map((cat) => {
          const catRules = rulesByCategory[cat.id] ?? [];
          const isExpanded = expanded === cat.id;

          return (
            <Card key={cat.id}>
              <CardHeader
                className="py-3 cursor-pointer select-none"
                onClick={() => setExpanded(isExpanded ? null : cat.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <CardTitle className="text-sm font-medium">{cat.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {cat.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">
                      {catRules.length} rule{catRules.length !== 1 ? "s" : ""}
                    </span>
                    {!cat.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteCategory(cat.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 pb-3">
                  <div className="space-y-2 ml-7">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Matching rules
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setAddRuleFor(cat.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add rule
                      </Button>
                    </div>

                    {catRules.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No rules — transactions are categorised manually or by AI.</p>
                    ) : (
                      <div className="space-y-1">
                        {catRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {rule.patternType}
                              </Badge>
                              <code className="text-xs font-mono">{rule.pattern}</code>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteRule(rule.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {addRuleFor !== null && (
        <AddRuleDialog
          categoryId={addRuleFor}
          categoryName={categories.find((c) => c.id === addRuleFor)?.name ?? ""}
          onClose={() => setAddRuleFor(null)}
        />
      )}
    </div>
  );
}

function AddCategoryDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            const result = await createCategory(null, fd);
            setPending(false);
            if (result.success) setOpen(false);
            else setError(result.error);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" required />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select name="type" defaultValue="expense">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <Input name="color" type="color" defaultValue="#6366f1" className="h-9 w-full" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRuleDialog({
  categoryId,
  categoryName,
  onClose,
}: {
  categoryId: number;
  categoryName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add rule for {categoryName}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("categoryId", String(categoryId));
            const result = await createRule(null, fd);
            if (result.success) onClose();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Pattern type</Label>
            <Select name="patternType" defaultValue="keyword">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keyword">Keyword (contains)</SelectItem>
                <SelectItem value="exact">Exact match</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Pattern</Label>
            <Input name="pattern" required placeholder="e.g. WOOLWORTHS" />
          </div>
          <div className="space-y-2">
            <Label>Priority (higher = checked first)</Label>
            <Input name="priority" type="number" defaultValue="0" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Add rule</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
