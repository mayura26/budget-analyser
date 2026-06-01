type ReviewSavingsInput = {
  actualIncome: number;
  totalSpent: number;
  taggedSavings: number;
};

export type ReviewSavingsMetrics = {
  taggedSavings: number;
  surplus: number;
  effectiveSavings: number;
  savingsRate: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateReviewSavingsMetrics({
  actualIncome,
  totalSpent,
  taggedSavings,
}: ReviewSavingsInput): ReviewSavingsMetrics {
  const income = roundMoney(actualIncome);
  const spent = roundMoney(totalSpent);
  const tagged = roundMoney(taggedSavings);
  const surplus = Math.max(0, roundMoney(income - spent - tagged));
  const effectiveSavings = roundMoney(tagged + surplus);
  const savingsRate =
    income > 0 ? roundRate((effectiveSavings / income) * 100) : 0;

  return {
    taggedSavings: tagged,
    surplus,
    effectiveSavings,
    savingsRate,
  };
}

export function reviewSavingsMetricsMatch(
  actual: ReviewSavingsMetrics,
  expected: ReviewSavingsMetrics,
): boolean {
  return (
    Math.abs(actual.taggedSavings - expected.taggedSavings) <= 0.01 &&
    Math.abs(actual.surplus - expected.surplus) <= 0.01 &&
    Math.abs(actual.effectiveSavings - expected.effectiveSavings) <= 0.01 &&
    Math.abs(actual.savingsRate - expected.savingsRate) <= 0.1
  );
}
