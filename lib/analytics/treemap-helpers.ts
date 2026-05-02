import type { AnalyticsTreemapDatum, CategoryHierarchyNode } from "@/types";

export type BuildTreemapDatumOptions = {
  /** Root node label when multiple children are grouped (default `"Spending"`). */
  rootLabel?: string;
  /**
   * Income hierarchies may include signed nets; treemap cell size uses max(0, total)
   * and only includes nodes with non-zero totals.
   */
  incomeStyle?: boolean;
};

export function buildTreemapDatumForNodes(
  nodes: CategoryHierarchyNode[],
  options?: BuildTreemapDatumOptions,
): AnalyticsTreemapDatum | null {
  const rootLabel = options?.rootLabel ?? "Spending";
  const incomeStyle = options?.incomeStyle ?? false;

  const cellValue = (total: number) =>
    incomeStyle ? Math.max(0, total) : total;

  const includeInTreemap = (total: number) =>
    incomeStyle ? total !== 0 && cellValue(total) > 0 : total > 0;

  const withValue = nodes.filter((r) => includeInTreemap(r.total));
  if (withValue.length === 0) return null;

  function toDatum(n: CategoryHierarchyNode): AnalyticsTreemapDatum {
    const childList = n.children
      .filter((c) => includeInTreemap(c.total))
      .map(toDatum);
    const children = childList.length > 0 ? childList : undefined;
    return {
      name: n.name,
      value: cellValue(n.total),
      fill: n.color,
      categoryId: n.id,
      ...(children ? { children } : {}),
    };
  }

  const children = withValue.map(toDatum);
  if (children.length === 1) {
    const only = children[0];
    if (only) return only;
  }
  return {
    name: rootLabel,
    value: withValue.reduce((s, r) => s + cellValue(r.total), 0),
    fill: "#64748b",
    categoryId: null,
    children,
  };
}
