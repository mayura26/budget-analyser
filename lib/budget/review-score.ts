import type { BudgetCategoryRow } from "@/types";

export type DiscretionaryMetrics = { actual: number; target: number };
type Band = { actualPct: number; targetAmount: number };
export type ScoreMetrics = {
  actualIncome: number;
  totalBudgeted: number;
  totalSpent: number;
  effectiveSavings: number;
  savingsRate: number;
  buckets: { needs: Band; wants: Band; savings: Band };
  discretionary?: DiscretionaryMetrics;
};

/** Needs and categories containing scheduled fixed costs are excluded. */
export function discretionaryMetrics(
  rows: BudgetCategoryRow[],
): DiscretionaryMetrics {
  return rows.reduce(
    (sum, row) => {
      if (
        row.categoryKind !== "expense" ||
        row.ruleBucket !== "wants" ||
        row.scheduledAmount > 0
      )
        return sum;
      return {
        actual: sum.actual + Math.max(0, row.actualSpent),
        target: sum.target + Math.max(0, row.targetAmount),
      };
    },
    { actual: 0, target: 0 },
  );
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
// Hitting a target earns 80; beating it by 20% earns 100.
function spendingPoints(actual: number, target: number): number {
  if (target <= 0) return actual <= 0 ? 100 : 0;
  return clamp(80 + (100 * (target - actual)) / target);
}

export function calculateReviewScore(m: ScoreMetrics) {
  if (m.actualIncome <= 0 || m.totalBudgeted <= 0 || !m.discretionary)
    return null;
  const savingsTarget = Math.max(0, m.buckets.savings.targetAmount);
  const savings =
    (clamp((80 * Math.max(0, m.savingsRate)) / 20) +
      (savingsTarget > 0
        ? clamp((80 * Math.max(0, m.effectiveSavings)) / savingsTarget)
        : clamp((80 * Math.max(0, m.savingsRate)) / 20))) /
    2;
  const allocation =
    (spendingPoints(m.buckets.needs.actualPct, 50) +
      spendingPoints(m.buckets.wants.actualPct, 30) +
      clamp((80 * Math.max(0, m.savingsRate)) / 20)) /
    3;
  const budget =
    (spendingPoints(m.totalSpent, m.totalBudgeted) + allocation) / 2;
  const discretionary = spendingPoints(
    m.discretionary.actual,
    m.discretionary.target,
  );
  const total = savings * 0.4 + budget * 0.3 + discretionary * 0.3;
  const score =
    total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 40 ? 2 : 1;
  return { score, total, savings, budget, discretionary };
}
