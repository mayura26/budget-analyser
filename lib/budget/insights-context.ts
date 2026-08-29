import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatSignedCurrency } from "@/lib/utils";
import type { BudgetCategoryRow } from "@/types";

/** Aggregated per-parent-group data fed to the AI budget insights prompt. */
export type InsightParentGroup = {
  parentName: string;
  rows: BudgetCategoryRow[];
  /** Sum of this month's actual spend last month, for the same categories. */
  prevSpend: number;
  /** Scheduled amount still due this month for the group. */
  schedRemaining: number;
};

/**
 * Builds the prompt line describing one parent group's budget standing.
 *
 * Savings/investing groups are INVERSE of spending groups: saving MORE than the
 * target is a win, falling short is the concern. We frame those lines with
 * saving verbs and an explicit direction hint so the LLM does not mislabel an
 * over-target savings group as "over budget" — mirroring the UI inversion in
 * `getBudgetStatus(..., "savings")` and `savingsRemainingDisplay`.
 */
export function buildParentGroupLine(
  group: InsightParentGroup,
  homeCurrency: SupportedCurrency,
): string {
  const { parentName, rows, prevSpend, schedRemaining } = group;
  const groupTarget = rows.reduce((s, r) => s + r.targetAmount, 0);
  const groupActual = rows.reduce((s, r) => s + r.actualSpent, 0);
  const groupPct =
    groupTarget > 0 ? Math.round((groupActual / groupTarget) * 100) : 0;
  const groupProjected = groupActual + schedRemaining;
  const bucket = rows[0]?.ruleBucket ?? null;
  const money = (n: number) => formatSignedCurrency(n, homeCurrency);

  if (bucket === "savings") {
    // Inverse: ahead of plan is good, short of plan is the concern.
    const diff = groupActual - groupTarget;
    const direction =
      diff >= 0
        ? `ahead of plan by ${money(diff)} (a win — saved more than planned)`
        : `short of plan by ${money(-diff)}`;
    const subLines = rows
      .map((r) => {
        const pct =
          r.targetAmount > 0
            ? Math.round((r.actualSpent / r.targetAmount) * 100)
            : 0;
        return `${r.categoryName} ${money(r.actualSpent)} of ${money(r.targetAmount)} (${pct}% of plan)`;
      })
      .join(", ");
    return `- ${parentName} (savings — INVERSE: over target is GOOD): Planned saving ${money(groupTarget)}, Saved ${money(groupActual)} (${groupPct}% of plan, ${direction}), Last month saved: ${money(prevSpend)}, Projected saving: ${money(groupProjected)}\n  Subcategories: ${subLines}`;
  }

  const subLines = rows
    .map((r) => {
      const pct =
        r.targetAmount > 0
          ? Math.round((r.actualSpent / r.targetAmount) * 100)
          : 0;
      return `${r.categoryName} ${money(r.actualSpent)} of ${money(r.targetAmount)} (${pct}%)`;
    })
    .join(", ");
  const bucketLabel = bucket ? ` (${bucket})` : "";
  return `- ${parentName}${bucketLabel}: Target ${money(groupTarget)}, Spent ${money(groupActual)} (${groupPct}%), Last month: ${money(prevSpend)}, Still scheduled this month: ${money(schedRemaining)}, Projected: ${money(groupProjected)}\n  Subcategories: ${subLines}`;
}
