import assert from "node:assert";
import { test } from "node:test";
import type { BudgetCategoryRow, BudgetRuleBucket } from "@/types";
import { buildParentGroupLine } from "./insights-context";

function row(
  overrides: Partial<BudgetCategoryRow> &
    Pick<BudgetCategoryRow, "categoryName" | "targetAmount" | "actualSpent">,
): BudgetCategoryRow {
  const bucket: BudgetRuleBucket | null = overrides.ruleBucket ?? "wants";
  return {
    categoryId: 1,
    parentName: "Group",
    color: "#000",
    scheduledAmount: 0,
    scheduledBreakdown: [],
    avg3Month: 0,
    categoryKind: bucket === "savings" ? "savings" : "expense",
    ruleBucket: bucket,
    ...overrides,
  };
}

test("savings group over target reads as a win, not over budget", () => {
  const line = buildParentGroupLine(
    {
      parentName: "Savings & Investing",
      rows: [
        row({
          categoryName: "Investments",
          targetAmount: 5500,
          actualSpent: 7092,
          ruleBucket: "savings",
        }),
      ],
      prevSpend: 4000,
      schedRemaining: 0,
    },
    "USD",
  );

  assert.match(line, /INVERSE: over target is GOOD/);
  assert.match(line, /ahead of plan/);
  assert.match(line, /a win/);
  assert.doesNotMatch(line, /over budget/i);
  // Frames the figure as saving, not spending.
  assert.match(line, /Saved/);
  assert.doesNotMatch(line, /Spent/);
});

test("savings group under target reports the shortfall", () => {
  const line = buildParentGroupLine(
    {
      parentName: "Savings & Investing",
      rows: [
        row({
          categoryName: "Investments",
          targetAmount: 5500,
          actualSpent: 4000,
          ruleBucket: "savings",
        }),
      ],
      prevSpend: 4000,
      schedRemaining: 0,
    },
    "USD",
  );

  assert.match(line, /short of plan/);
  assert.doesNotMatch(line, /a win/);
});

test("expense group keeps spend/projected framing", () => {
  const line = buildParentGroupLine(
    {
      parentName: "Enjoyment",
      rows: [
        row({
          categoryName: "Dining",
          targetAmount: 400,
          actualSpent: 520,
          ruleBucket: "wants",
        }),
      ],
      prevSpend: 300,
      schedRemaining: 50,
    },
    "USD",
  );

  assert.match(line, /\(wants\)/);
  assert.match(line, /Spent/);
  assert.match(line, /Projected/);
  assert.doesNotMatch(line, /INVERSE/);
});
