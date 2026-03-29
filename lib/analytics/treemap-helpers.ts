import type { AnalyticsTreemapDatum, CategoryHierarchyNode } from "@/types";

export function buildTreemapDatumForNodes(
  nodes: CategoryHierarchyNode[],
): AnalyticsTreemapDatum | null {
  const withValue = nodes.filter((r) => r.total > 0);
  if (withValue.length === 0) return null;

  function toDatum(n: CategoryHierarchyNode): AnalyticsTreemapDatum {
    const childList = n.children.filter((c) => c.total > 0).map(toDatum);
    const children = childList.length > 0 ? childList : undefined;
    return {
      name: n.name,
      value: n.total,
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
    name: "Spending",
    value: withValue.reduce((s, r) => s + r.total, 0),
    fill: "#64748b",
    categoryId: null,
    children,
  };
}
