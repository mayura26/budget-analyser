export type SuggestedRule = {
  pattern: string;
  categoryId: number;
  categoryName: string;
  matchCount: number;
  /** Unconfirmed transactions whose normalised text matches this keyword (current DB). */
  unverifiedMatchCount?: number;
};

const RULE_BLOCKLIST = new Set([
  "TRANSFER",
  "DIRECT",
  "DEBIT",
  "PAYMENT",
  "CREDIT",
  "ACCOUNT",
  "NETBANK",
  "PAYID",
  "COMMBANK",
  "BPAY",
  "EFTPOS",
  "ONLINE",
  "VISA",
  "CARD",
  "MASTERCARD",
  "BANK",
  "FROM",
  "INTO",
  "TRANSACTION",
]);

/** First meaningful token for a keyword rule; prefers non-generic tokens, falls back for transfer-like strings. */
function pickPatternToken(normalised: string): string | null {
  const raw = normalised
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));
  if (raw.length === 0) return null;
  const preferred = raw.filter((t) => !RULE_BLOCKLIST.has(t));
  const pick = preferred[0] ?? raw[0];
  return pick ?? null;
}

export function computeSuggestedRules(
  applied: { normalised: string; categoryId: number; categoryName: string }[],
): SuggestedRule[] {
  const ruleMap = new Map<string, SuggestedRule>();

  for (const item of applied) {
    const pattern = pickPatternToken(item.normalised);
    if (pattern == null) continue;

    const key = `${pattern}::${item.categoryId}`;
    const existing = ruleMap.get(key);
    if (existing) {
      existing.matchCount++;
    } else {
      ruleMap.set(key, {
        pattern,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        matchCount: 1,
      });
    }
  }

  return Array.from(ruleMap.values()).sort(
    (a, b) => b.matchCount - a.matchCount,
  );
}
