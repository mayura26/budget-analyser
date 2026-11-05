"use client";

import { Search } from "lucide-react";
import { useRef, useState } from "react";
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
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const navigatingOptions = useRef(false);
  const pattern = new RegExp(
    search
      .trim()
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*"),
    "i",
  );
  const rank = (main: Category) => {
    if (main.name === "Special") return 2;
    if (main.name === "Misc") return 5;
    return { expense: 0, income: 1, savings: 3, transfer: 4 }[main.type];
  };
  const orderedMains = [...mains].sort((a, b) => rank(a) - rank(b));
  const visibleCategories = categories.filter(
    (category) =>
      pattern.test(parseCategoryDisplayName(category.name).title) ||
      pattern.test(
        mains.find((main) => main.id === category.parentId)?.name ?? "",
      ),
  );
  return (
    <>
      <div className="sticky top-0 z-10 bg-popover pb-1">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <input
            ref={searchInput}
            aria-label="Search categories"
            placeholder="Search categories…"
            value={search}
            onFocus={() => {
              navigatingOptions.current = false;
            }}
            onBlur={() => {
              if (!navigatingOptions.current) {
                searchInput.current?.focus({ preventScroll: true });
              }
            }}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              navigatingOptions.current = [
                "Escape",
                "Tab",
                "ArrowDown",
                "ArrowUp",
              ].includes(event.key);
              if (
                !["Escape", "Tab", "ArrowDown", "ArrowUp"].includes(event.key)
              )
                event.stopPropagation();
            }}
            className="h-9 w-full rounded-sm border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      {visibleCategories.length === 0 && (
        <output className="block px-3 py-4 text-center text-sm text-muted-foreground">
          No categories found
        </output>
      )}
      {orderedMains.map((main) => {
        const subs = visibleCategories.filter((c) => c.parentId === main.id);
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
