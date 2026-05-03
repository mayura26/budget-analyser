import {
  BUDGET_SYNTHETIC_SURPLUS_CATEGORY_ID,
  type BudgetCategoryRow,
  type BudgetSummary,
} from "@/types";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const SYNTHETIC_SURPLUS_NAME = "Income surplus (unallocated)";
const SYNTHETIC_PARENT = "Savings & Investing";
const SYNTHETIC_COLOR = "#059669";

/**
 * Planned breathing room: scheduled expected income minus all expense and savings targets.
 * Actual: income basis minus expense outflows minus tracked savings (signed; live for open months).
 */
export function buildSurplusDisplayRow(summary: BudgetSummary): BudgetCategoryRow {
  const plannedTarget = roundMoney(
    summary.expectedIncome -
      summary.totalBudgeted -
      summary.totalSavingsBudgeted,
  );
  const signedActual = roundMoney(
    summary.incomeBasis -
      summary.totalSpent -
      summary.totalSavingsAllocated,
  );

  return {
    categoryId: BUDGET_SYNTHETIC_SURPLUS_CATEGORY_ID,
    categoryName: SYNTHETIC_SURPLUS_NAME,
    parentName: SYNTHETIC_PARENT,
    color: SYNTHETIC_COLOR,
    targetAmount: plannedTarget,
    actualSpent: signedActual,
    scheduledAmount: 0,
    avg3Month: 0,
    categoryKind: "savings",
    ruleBucket: null,
    isSyntheticSurplus: true,
  };
}

export function appendSurplusDisplayRows(
  realRows: BudgetCategoryRow[],
  summary: BudgetSummary,
): BudgetCategoryRow[] {
  return [...realRows, buildSurplusDisplayRow(summary)];
}
