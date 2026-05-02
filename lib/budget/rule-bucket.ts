import type { BudgetRuleBucket, Category } from "@/types";

/** 50/30/20 band for a subcategory from its parent main group. */
export function ruleBucketForSubcategory(
  parentMain: Category | undefined,
): BudgetRuleBucket | null {
  if (!parentMain || parentMain.parentId !== null) return null;

  const raw = parentMain.budgetRuleBucket;
  if (parentMain.type === "income" || parentMain.type === "transfer") {
    return null;
  }
  if (raw === "none") return null;
  if (raw === "needs" || raw === "wants" || raw === "savings") return raw;
  if (parentMain.type === "expense") return "wants";
  if (parentMain.type === "savings") return "savings";
  return null;
}
