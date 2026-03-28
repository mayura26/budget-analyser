import type { CategorisationRule } from "@/types";

export type MatchResult = {
  categoryId: number;
  confidence: number;
  ruleId: number;
};

export function matchRule(
  normalised: string,
  rule: CategorisationRule,
): boolean {
  switch (rule.patternType) {
    case "exact":
      return normalised.toLowerCase() === rule.pattern.toLowerCase();
    case "keyword":
      return normalised.toLowerCase().includes(rule.pattern.toLowerCase());
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(normalised);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function findMatchingRule(
  normalised: string,
  rules: CategorisationRule[],
): MatchResult | null {
  // Rules are pre-sorted by priority DESC
  for (const rule of rules) {
    if (matchRule(normalised, rule)) {
      return {
        categoryId: rule.categoryId,
        confidence: rule.confidence,
        ruleId: rule.id,
      };
    }
  }
  return null;
}

/** In-memory rule for matching only (not persisted). */
export function keywordRuleStub(
  pattern: string,
  categoryId: number,
): CategorisationRule {
  return {
    id: 0,
    categoryId,
    pattern,
    patternType: "keyword",
    priority: 10,
    confidence: 0.9,
    isUserDefined: true,
    createdAt: 0,
    updatedAt: 0,
  };
}
