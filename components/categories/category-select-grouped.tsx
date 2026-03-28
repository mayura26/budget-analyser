"use client";

import {
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";
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
            <SelectLabel>{main.name}</SelectLabel>
            {subs.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
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
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
