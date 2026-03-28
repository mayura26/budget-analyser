"use client";

import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import {
  formatCategoryOptionPlainText,
  parseCategoryDisplayName,
} from "@/lib/categories/display-name";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export function CategorySelectGrouped({
  categories,
  mains,
}: {
  categories: Category[];
  mains: Category[];
}) {
  return (
    <>
      {mains.map((main) => {
        const subs = categories.filter((c) => c.parentId === main.id);
        if (subs.length === 0) return null;
        return (
          <SelectGroup key={main.id}>
            <SelectLabel
              className={cn(
                "!pl-3 !pr-2 !py-2 mt-1.5 first:mt-0 first:!pt-1.5",
                "cursor-default select-none rounded-sm",
                "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
                "border border-border/60 bg-muted/50",
              )}
            >
              {parseCategoryDisplayName(main.name).title}
            </SelectLabel>
            {subs.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <CategoryNameParts name={c.name} variant="select" />
              </SelectItem>
            ))}
          </SelectGroup>
        );
      })}
    </>
  );
}

export function CategoryOptgroupNative({
  categories,
  mains,
}: {
  categories: Category[];
  mains: Category[];
}) {
  return (
    <>
      {mains.map((main) => (
        <optgroup key={main.id} label={main.name}>
          {categories
            .filter((c) => c.parentId === main.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {formatCategoryOptionPlainText(c.name)}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
