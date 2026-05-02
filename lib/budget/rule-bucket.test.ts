import assert from "node:assert";
import { test } from "node:test";
import type { Category } from "@/types";
import { isSpecialMainGroup, ruleBucketForSubcategory } from "./rule-bucket";

function main(
  overrides: Partial<Category> & Pick<Category, "name" | "type">,
): Category {
  return {
    id: 1,
    name: overrides.name,
    color: "#000",
    icon: null,
    parentId: null,
    type: overrides.type,
    budgetRuleBucket: overrides.budgetRuleBucket ?? null,
    isSystem: true,
    createdAt: 0,
    ...overrides,
  };
}

test("Special main with bucket none resolves to wants", () => {
  const parent = main({
    name: "Special",
    type: "expense",
    budgetRuleBucket: "none",
  });
  assert.strictEqual(ruleBucketForSubcategory(parent), "wants");
});

test("One-off & irregular main with bucket none resolves to wants", () => {
  const parent = main({
    name: "One-off & irregular",
    type: "expense",
    budgetRuleBucket: "none",
  });
  assert.strictEqual(ruleBucketForSubcategory(parent), "wants");
});

test("non-Special expense main with bucket none resolves to null", () => {
  const parent = main({
    name: "Enjoyment",
    type: "expense",
    budgetRuleBucket: "none",
  });
  assert.strictEqual(ruleBucketForSubcategory(parent), null);
});

test("Living Costs with needs stays needs", () => {
  const parent = main({
    name: "Living Costs",
    type: "expense",
    budgetRuleBucket: "needs",
  });
  assert.strictEqual(ruleBucketForSubcategory(parent), "needs");
});

test("Savings & Investing main resolves subs band to savings", () => {
  const parent = main({
    name: "Savings & Investing",
    type: "savings",
    budgetRuleBucket: "savings",
  });
  assert.strictEqual(ruleBucketForSubcategory(parent), "savings");
});

test("isSpecialMainGroup recognises canonical and legacy names", () => {
  assert.strictEqual(isSpecialMainGroup("Special"), true);
  assert.strictEqual(isSpecialMainGroup("One-off & irregular"), true);
  assert.strictEqual(isSpecialMainGroup("Enjoyment"), false);
});

test("subcategory parent reference returns null", () => {
  const sub = main({
    name: "Holidays",
    type: "expense",
    parentId: 99,
    budgetRuleBucket: null,
  });
  assert.strictEqual(ruleBucketForSubcategory(sub), null);
});
