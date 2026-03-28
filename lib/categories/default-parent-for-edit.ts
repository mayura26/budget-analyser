import type { Category } from "@/types";

/**
 * Value for the main-group Select when editing a sub-category.
 * If the stored parent is missing or not a main group, pick a valid default so Radix Select stays controlled.
 */
export function defaultParentIdStringForSubEdit(
  category: Category,
  mains: Category[],
): string {
  if (category.parentId != null) {
    const stillThere = mains.some((m) => m.id === category.parentId);
    if (stillThere) return String(category.parentId);
  }
  const sameType = mains.find((m) => m.type === category.type);
  if (sameType) return String(sameType.id);
  return mains[0] ? String(mains[0].id) : "";
}
