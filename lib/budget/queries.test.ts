import assert from "node:assert";
import { test } from "node:test";
import type { BudgetCategoryRow } from "@/types";
import { buildBudgetSummary, netOutflowFromSignedSum } from "./queries";

function budgetRow(
  overrides: Partial<BudgetCategoryRow> &
    Pick<
      BudgetCategoryRow,
      "categoryId" | "categoryKind" | "ruleBucket" | "actualSpent"
    >,
): BudgetCategoryRow {
  return {
    categoryId: overrides.categoryId,
    categoryName: "Test category",
    parentName: "Test parent",
    color: "#14b8a6",
    targetAmount: 0,
    actualSpent: overrides.actualSpent,
    scheduledAmount: 0,
    scheduledBreakdown: [],
    avg3Month: 0,
    categoryKind: overrides.categoryKind,
    ruleBucket: overrides.ruleBucket,
    ...overrides,
  };
}

test("50/30/20 savings uses tracked allocations for an open month", () => {
  const summary = buildBudgetSummary(
    [
      budgetRow({
        categoryId: 1,
        categoryKind: "expense",
        ruleBucket: "needs",
        targetAmount: 8000,
        actualSpent: 5660.33,
      }),
      budgetRow({
        categoryId: 2,
        categoryKind: "savings",
        ruleBucket: "savings",
        targetAmount: 7000,
        actualSpent: 7982.46,
      }),
    ],
    "2026-09",
    23412.82,
    7831.84,
    false,
  );

  assert.equal(summary.rule502030.savings.guideline, 4682.56);
  assert.equal(summary.rule502030.savings.actualTotal, 7982.46);
  assert.equal(
    Math.round(
      (summary.rule502030.savings.actualTotal /
        summary.rule502030.savings.guideline) *
        100,
    ),
    170,
  );
  assert.equal(summary.implicitSurplusAsSavings, 0);
});

test("50/30/20 savings only includes unallocated surplus after close", () => {
  const rows = [
    budgetRow({
      categoryId: 1,
      categoryKind: "expense",
      ruleBucket: "needs",
      actualSpent: 4000,
    }),
    budgetRow({
      categoryId: 2,
      categoryKind: "savings",
      ruleBucket: "savings",
      actualSpent: 1000,
    }),
  ];

  const openSummary = buildBudgetSummary(rows, "2026-09", 10000, 10000, false);
  const closedSummary = buildBudgetSummary(rows, "2026-09", 10000, 10000, true);

  assert.equal(openSummary.implicitSurplusAsSavings, 0);
  assert.equal(openSummary.rule502030.savings.actualTotal, 1000);
  assert.equal(closedSummary.implicitSurplusAsSavings, 5000);
  assert.equal(closedSummary.rule502030.savings.actualTotal, 6000);
});

test("net outflow stays signed when refunds exceed expense spend", () => {
  assert.equal(netOutflowFromSignedSum(-125), 125);
  assert.equal(netOutflowFromSignedSum(3791.56), -3791.56);
});

test("expense refunds can make budget spending negative", () => {
  const summary = buildBudgetSummary(
    [
      budgetRow({
        categoryId: 1,
        categoryKind: "expense",
        ruleBucket: "wants",
        targetAmount: 500,
        actualSpent: -3791.56,
      }),
    ],
    "2026-09",
    5000,
    5000,
    false,
  );

  assert.equal(summary.totalSpent, -3791.56);
  assert.equal(summary.totalRemaining, 4291.56);
  assert.equal(summary.rule502030.wants.actualTotal, -3791.56);
});
