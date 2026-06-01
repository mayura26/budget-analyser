import assert from "node:assert";
import { test } from "node:test";
import { calculateReviewSavingsMetrics } from "./review-savings";

test("calculates May review surplus after tagged savings", () => {
  assert.deepStrictEqual(
    calculateReviewSavingsMetrics({
      actualIncome: 29460.85,
      totalSpent: 22202.88,
      taggedSavings: 6445.72,
    }),
    {
      taggedSavings: 6445.72,
      surplus: 812.25,
      effectiveSavings: 7257.97,
      savingsRate: 24.6,
    },
  );
});

test("treats income after expenses as effective savings when nothing is tagged", () => {
  assert.deepStrictEqual(
    calculateReviewSavingsMetrics({
      actualIncome: 3000,
      totalSpent: 1900,
      taggedSavings: 0,
    }),
    {
      taggedSavings: 0,
      surplus: 1100,
      effectiveSavings: 1100,
      savingsRate: 36.7,
    },
  );
});

test("clamps surplus when expenses plus tagged savings exceed income", () => {
  assert.deepStrictEqual(
    calculateReviewSavingsMetrics({
      actualIncome: 3000,
      totalSpent: 2800,
      taggedSavings: 500,
    }),
    {
      taggedSavings: 500,
      surplus: 0,
      effectiveSavings: 500,
      savingsRate: 16.7,
    },
  );
});
