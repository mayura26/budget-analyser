"use client";

import { useMemo, useState } from "react";
import {
  deleteCategory,
  createCategory,
  deleteRule,
  createRule,
  updateCategory,
} from "@/lib/actions/categories";
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
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import type { Category, CategorisationRule } from "@/types";
import { deriveSubcategoryColor } from "@/lib/categories/colors";

type CategoryWithCount = Category & { ruleCount: number };

const TYPE_OPTIONS = ["expense", "income", "transfer"] as const;

export function CategoryList({
  categories,
  rules,
}: {
  categories: CategoryWithCount[];
  rules: CategorisationRule[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addRuleFor, setAddRuleFor] = useState<number | null>(null);

  const rulesByCategory = useMemo(
    () =>
      rules.reduce<Record<number, CategorisationRule[]>>((acc, rule) => {
        if (!acc[rule.categoryId]) acc[rule.categoryId] = [];
        acc[rule.categoryId].push(rule);
        return acc;
      }, {}),
    [rules]
  );

  const mains = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const subsByMain = useMemo(() => {
    const map = new Map<number, CategoryWithCount[]>();
    for (const c of categories) {
      if (c.parentId == null) continue;
      if (!map.has(c.parentId)) map.set(c.parentId, []);
      map.get(c.parentId)!.push(c);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [categories]);

  const mainIds = useMemo(() => new Set(mains.map((m) => m.id)), [mains]);
  const orphanSubs = useMemo(
    () =>
      categories.filter(
        (c) => c.parentId != null && !mainIds.has(c.parentId)
      ),
    [categories, mainIds]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <AddMainGroupDialog />
        <AddSubCategoryDialog categories={categories} mains={mains} />
      </div>

      <div className="space-y-8">
        {mains.map((main) => {
          const subs = subsByMain.get(main.id) ?? [];
          return (
            <section key={main.id} className="space-y-2">
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 bg-muted/30"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: main.color,
                }}
              >
                <div
                  className="h-4 w-4 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: main.color }}
                />
                <h2 className="text-base font-semibold">{main.name}</h2>
                <Badge variant="outline" className="text-xs">
                  {main.type}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  <EditCategoryDialog category={main} mains={mains} isMain />
                  {!main.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteCategory(main.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2 pl-2 sm:pl-4">
                {subs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sub-categories yet — use &quot;Add sub-category&quot; to add one.
                  </p>
                ) : (
                  subs.map((cat) => {
                    const catRules = rulesByCategory[cat.id] ?? [];
                    const isExpanded = expanded === cat.id;
                    return (
                      <Card key={cat.id}>
                        <CardHeader
                          className="py-3 cursor-pointer select-none"
                          onClick={() =>
                            setExpanded(isExpanded ? null : cat.id)
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <div
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              <CardTitle className="text-sm font-medium truncate">
                                {cat.name}
                              </CardTitle>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {cat.type}
                              </Badge>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-muted-foreground">
                                {catRules.length} rule
                                {catRules.length !== 1 ? "s" : ""}
                              </span>
                              <EditCategoryDialog
                                category={cat}
                                mains={mains}
                                isMain={false}
                              />
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
                                <p className="text-xs text-muted-foreground">
                                  No rules — transactions use manual or AI
                                  categorisation.
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {catRules.map((rule) => (
                                    <div
                                      key={rule.id}
                                      className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Badge
                                          variant="outline"
                                          className="text-xs shrink-0"
                                        >
                                          {rule.patternType}
                                        </Badge>
                                        <code className="text-xs font-mono truncate">
                                          {rule.pattern}
                                        </code>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
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
                  })
                )}
              </div>
            </section>
          );
        })}

        {orphanSubs.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Sub-categories with missing parent ({orphanSubs.length})
            </p>
            <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5">
              {orphanSubs.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {addRuleFor !== null && (
        <AddRuleDialog
          categoryId={addRuleFor}
          categoryName={
            categories.find((c) => c.id === addRuleFor)?.name ?? ""
          }
          onClose={() => setAddRuleFor(null)}
        />
      )}
    </div>
  );
}

function AddMainGroupDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<string>("expense");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add main group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New main group</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            const result = await createCategory(null, fd);
            setPending(false);
            if (result.success) setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" required />
          </div>
          <input type="hidden" name="type" value={type} />
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
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

function AddSubCategoryDialog({
  categories,
  mains,
}: {
  categories: CategoryWithCount[];
  mains: CategoryWithCount[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const main = mains.find((m) => String(m.id) === parentId);
  const type = main?.type ?? "expense";

  const siblingCount = useMemo(() => {
    if (!parentId) return 0;
    const pid = Number(parentId);
    return categories.filter((c) => c.parentId === pid).length;
  }, [categories, parentId]);

  const defaultColor = main
    ? deriveSubcategoryColor(main.color, siblingCount)
    : "#6366f1";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add sub-category
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New sub-category</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            fd.set("parentId", parentId);
            fd.set("type", type);
            const result = await createCategory(null, fd);
            setPending(false);
            if (result.success) setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Main group</Label>
            <Select value={parentId} onValueChange={setParentId} required>
              <SelectTrigger>
                <SelectValue placeholder="Choose main group" />
              </SelectTrigger>
              <SelectContent>
                {mains.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" required disabled={!parentId} />
          </div>
          <input type="hidden" name="type" value={type} />
          <p className="text-xs text-muted-foreground">
            Type matches the main group: <strong>{type}</strong>
          </p>
          <div className="space-y-2">
            <Label>Colour</Label>
            <Input
              name="color"
              type="color"
              key={parentId || "none"}
              defaultValue={defaultColor}
              className="h-9 w-full"
              disabled={!parentId}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || !parentId}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryDialog({
  category,
  mains,
  isMain,
}: {
  category: CategoryWithCount;
  mains: CategoryWithCount[];
  isMain: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<string>(category.type);
  const [parentId, setParentId] = useState(String(category.parentId ?? ""));

  const selectedMain = !isMain
    ? mains.find((m) => String(m.id) === parentId)
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isMain ? "Edit main group" : "Edit sub-category"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            fd.set("type", isMain ? type : (selectedMain?.type ?? category.type));
            if (!isMain) fd.set("parentId", parentId);
            const result = await updateCategory(category.id, null, fd);
            setPending(false);
            if (result.success) setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" required defaultValue={category.name} />
          </div>
          {isMain ? (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Main group</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mains.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Type follows main group:{" "}
                <strong>{selectedMain?.type ?? category.type}</strong>
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Colour</Label>
            <Input
              name="color"
              type="color"
              defaultValue={category.color}
              className="h-9 w-full"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            Save
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
            <select
              name="patternType"
              defaultValue="keyword"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="keyword">Keyword (contains)</option>
              <option value="exact">Exact match</option>
              <option value="regex">Regex</option>
            </select>
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
            <Button type="submit" className="flex-1">
              Add rule
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
