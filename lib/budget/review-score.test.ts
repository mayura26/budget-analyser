import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetCategoryRow } from "@/types";
import {
  calculateReviewScore,
  discretionaryMetrics,
  type ScoreMetrics,
} from "./review-score";

const baseline: ScoreMetrics = {
  actualIncome: 10000,
  totalBudgeted: 8000,
  totalSpent: 8000,
  effectiveSavings: 2000,
  savingsRate: 20,
  buckets: {
    needs: { actualPct: 50, targetAmount: 5000 },
    wants: { actualPct: 30, targetAmount: 3000 },
    savings: { actualPct: 20, targetAmount: 2000 },
  },
  discretionary: { actual: 1000, target: 1000 },
};

test("hitting all targets earns 80 and a happy score of 4", () => {
  assert.deepEqual(calculateReviewScore(baseline), {
    savings: 80,
    budget: 80,
    discretionary: 80,
    total: 80,
    score: 4,
  });
});

test("applies 40/30/30 without rounding components first", () => {
  const result = calculateReviewScore({
    ...baseline,
    savingsRate: 10,
    effectiveSavings: 1000,
    discretionary: { actual: 1200, target: 1000 },
  });
  assert.ok(result);
  assert.equal(result.savings, 40);
  assert.equal(result.discretionary, 60);
  assert.equal(
    result.total,
    result.savings * 0.4 + result.budget * 0.3 + result.discretionary * 0.3,
  );
  assert.equal(result.score, 2);
});

test("savings measures both the amount target and the 20 percent rule", () => {
  const result = calculateReviewScore({
    ...baseline,
    buckets: {
      ...baseline.buckets,
      savings: { actualPct: 20, targetAmount: 4000 },
    },
  });
  assert.equal(result?.savings, 60);
});

test("all five discrete scores are reachable", () => {
  for (const [rate, spending, needs, wants, discretionary, expected] of [
    [0, 16000, 100, 60, 2000, 1],
    [10, 10000, 60, 40, 1400, 2],
    [15, 8000, 50, 30, 1200, 3],
    [20, 8000, 50, 30, 1000, 4],
    [40, 6000, 40, 20, 500, 5],
  ]) {
    const result = calculateReviewScore({
      ...baseline,
      savingsRate: rate,
      effectiveSavings: rate * 100,
      totalSpent: spending,
      buckets: {
        ...baseline.buckets,
        needs: { actualPct: needs, targetAmount: 5000 },
        wants: { actualPct: wants, targetAmount: 3000 },
      },
      discretionary: { actual: discretionary, target: 1000 },
    });
    assert.equal(result?.score, expected);
  }
});

test("missing income, budget or discretionary data remains unrated", () => {
  assert.equal(calculateReviewScore({ ...baseline, actualIncome: 0 }), null);
  assert.equal(calculateReviewScore({ ...baseline, totalBudgeted: 0 }), null);
  assert.equal(
    calculateReviewScore({ ...baseline, discretionary: undefined }),
    null,
  );
});

test("unbudgeted discretionary spending earns zero, zero spending earns full credit", () => {
  assert.equal(
    calculateReviewScore({
      ...baseline,
      discretionary: { actual: 100, target: 0 },
    })?.discretionary,
    0,
  );
  assert.equal(
    calculateReviewScore({
      ...baseline,
      discretionary: { actual: 0, target: 0 },
    })?.discretionary,
    100,
  );
});

test("discretionary totals exclude needs, savings and categories with scheduled fixed costs", () => {
  const row = (
    ruleBucket: BudgetCategoryRow["ruleBucket"],
    scheduledAmount: number,
    categoryKind: BudgetCategoryRow["categoryKind"] = "expense",
  ): BudgetCategoryRow => ({
    categoryId: 1,
    categoryName: "Test",
    parentName: "Test",
    color: "#000000",
    targetAmount: 500,
    actualSpent: 400,
    scheduledAmount,
    scheduledBreakdown: [],
    avg3Month: 0,
    categoryKind,
    ruleBucket,
  });
  assert.deepEqual(
    discretionaryMetrics([
      row("wants", 0),
      row("needs", 0),
      row("wants", 100),
      row("savings", 0, "savings"),
    ]),
    { actual: 400, target: 500 },
  );
});
