import type { BudgetRuleBucket, Category } from "@/types";

/** Main groups for holidays / one-off spend; always roll into Wants for 50/30/20. */
const SPECIAL_MAIN_NAMES = new Set(["Special", "One-off & irregular"]);

export function isSpecialMainGroup(mainGroupName: string): boolean {
  return SPECIAL_MAIN_NAMES.has(mainGroupName);
}

/** 50/30/20 band for a subcategory from its parent main group. */
export function ruleBucketForSubcategory(
  parentMain: Category | undefined,
): BudgetRuleBucket | null {
  if (!parentMain || parentMain.parentId !== null) return null;

  const raw = parentMain.budgetRuleBucket;
  if (parentMain.type === "income" || parentMain.type === "transfer") {
    return null;
  }
  if (parentMain.type === "expense" && isSpecialMainGroup(parentMain.name)) {
    return "wants";
  }
  if (raw === "none") return null;
  if (raw === "needs" || raw === "wants" || raw === "savings") return raw;
  if (parentMain.type === "expense") return "wants";
  if (parentMain.type === "savings") return "savings";
  return null;
}
