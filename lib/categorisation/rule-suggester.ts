export type SuggestedRule = {
  pattern: string;
  categoryId: number;
  categoryName: string;
  matchCount: number;
};

const RULE_BLOCKLIST = new Set([
  "TRANSFER", "DIRECT", "DEBIT", "PAYMENT", "CREDIT", "ACCOUNT",
  "NETBANK", "PAYID", "COMMBANK", "BPAY", "EFTPOS", "ONLINE",
  "VISA", "CARD", "MASTERCARD", "BANK", "FROM", "INTO", "TRANSACTION",
]);

export function computeSuggestedRules(
  applied: { normalised: string; categoryId: number; categoryName: string }[],
  transferCategoryIds: Set<number>
): SuggestedRule[] {
  const ruleMap = new Map<string, SuggestedRule>();

  for (const item of applied) {
    if (transferCategoryIds.has(item.categoryId)) continue;

    const tokens = item.normalised
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !RULE_BLOCKLIST.has(t) && !/^\d+$/.test(t));

    if (tokens.length === 0) continue;

    const key = `${tokens[0]}::${item.categoryId}`;
    const existing = ruleMap.get(key);
    if (existing) {
      existing.matchCount++;
    } else {
      ruleMap.set(key, {
        pattern: tokens[0],
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        matchCount: 1,
      });
    }
  }

  return Array.from(ruleMap.values()).sort((a, b) => b.matchCount - a.matchCount);
}
