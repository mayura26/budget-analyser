import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import type { Category } from "@/types";

/** Sub-categories (parent set) can be assigned to transactions and rules; main groups cannot. */
export function isAssignableCategoryId(categoryId: number): boolean {
  const row = db
    .select({ parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  return row != null && row.parentId != null;
}

/** Returns an error message if categoryId is a main group or missing; null if OK or null id. */
export function assignableCategoryError(
  categoryId: number | null | undefined,
): string | null {
  if (categoryId == null) return null;
  if (!isAssignableCategoryId(categoryId)) {
    return "Use a sub-category, not a main group";
  }
  return null;
}

export function filterAssignableCategories(cats: Category[]): Category[] {
  return cats.filter((c) => c.parentId != null);
}
