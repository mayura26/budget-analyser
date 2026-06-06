"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  applyDraftRulesToUnverifiedTransactions,
  applyKeywordRulesToUnverifiedTransactions,
} from "@/lib/actions/transactions";
import { assignableCategoryError } from "@/lib/categories/assignable";
import { serializeCategoryDisplayName } from "@/lib/categories/display-name";
import { matchRule, ruleDraftStub } from "@/lib/categorisation/rule-matcher";
import { db } from "@/lib/db";
import { refreshSubcategoryColorsForParent } from "@/lib/db/category-hierarchy-migrate";
import {
  mainSeedSuppressionKey,
  subSeedSuppressionKey,
  suppressCategorySeedKey,
} from "@/lib/db/category-seed-suppressions";
import {
  accounts,
  categories,
  categorisationRules,
  transactions,
} from "@/lib/db/schema";
import type { ActionResult, RuleDraftInput } from "@/types";

const bucketSchema = z.enum(["needs", "wants", "savings", "none"]).optional();

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  type: z.enum(["income", "expense", "transfer", "savings"]).default("expense"),
  budgetRuleBucket: bucketSchema,
});

const RuleSchema = z.object({
  categoryId: z.coerce.number(),
  pattern: z.string().min(1),
  patternType: z.enum(["regex", "keyword", "exact"]).default("keyword"),
  priority: z.coerce.number().default(0),
  confidence: z.coerce.number().min(0).max(1).default(1),
  isUserDefined: z.boolean().default(true),
});

function parseParentId(formData: FormData): number | undefined {
  const v = formData.get("parentId");
  if (v === null || v === "" || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function categoryNameFromFormData(formData: FormData): string {
  const title = String(formData.get("title") ?? "");
  const rawSub = formData.get("subtext");
  const subtext =
    rawSub === null || rawSub === undefined
      ? null
      : String(rawSub).trim() || null;
  return serializeCategoryDisplayName(title, subtext);
}

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const rawBucket = formData.get("budgetRuleBucket");
  const parsed = CategorySchema.safeParse({
    name: categoryNameFromFormData(formData),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
    budgetRuleBucket:
      rawBucket === "" || rawBucket === undefined || rawBucket === null
        ? undefined
        : String(rawBucket),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const parentId = parseParentId(formData);
  const { name, color, icon, type, budgetRuleBucket } = parsed.data;

  if (parentId) {
    const parent = db
      .select()
      .from(categories)
      .where(eq(categories.id, parentId))
      .get();
    if (!parent || parent.parentId !== null) {
      return { success: false, error: "Parent must be a main group" };
    }
    if (parent.type !== type) {
      return {
        success: false,
        error: "Sub-category type must match its main group",
      };
    }
    const result = db
      .insert(categories)
      .values({
        name,
        color,
        icon: icon ?? null,
        parentId,
        type,
        isSystem: false,
      })
      .returning({ id: categories.id })
      .get();
    revalidatePath("/categories");
    return { success: true, data: { id: result.id } };
  }

  const result = db
    .insert(categories)
    .values({
      name,
      color,
      icon: icon ?? null,
      parentId: null,
      type,
      budgetRuleBucket:
        budgetRuleBucket ??
        (type === "income" || type === "transfer"
          ? "none"
          : type === "savings"
            ? "savings"
            : "wants"),
      isSystem: false,
    })
    .returning({ id: categories.id })
    .get();
  revalidatePath("/categories");
  return { success: true, data: { id: result.id } };
}

export async function updateCategory(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawBucket = formData.get("budgetRuleBucket");
  const parsed = CategorySchema.safeParse({
    name: categoryNameFromFormData(formData),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
    budgetRuleBucket:
      rawBucket === "" || rawBucket === undefined || rawBucket === null
        ? undefined
        : String(rawBucket),
  });

  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  const existing = db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (!existing) {
    return { success: false, error: "Category not found" };
  }

  const parentId = parseParentId(formData);
  const { name, color, icon, type, budgetRuleBucket } = parsed.data;

  if (existing.parentId === null) {
    const child = db
      .select()
      .from(categories)
      .where(eq(categories.parentId, id))
      .limit(1)
      .get();
    if (child && parentId !== undefined) {
      return {
        success: false,
        error: "Remove sub-categories before changing a main group",
      };
    }
    db.update(categories)
      .set({
        name,
        color,
        icon: icon ?? null,
        type,
        parentId: null,
        budgetRuleBucket:
          budgetRuleBucket ??
          (type === "income" || type === "transfer"
            ? "none"
            : type === "savings"
              ? "savings"
              : "wants"),
      })
      .where(eq(categories.id, id))
      .run();
    if (color !== existing.color) {
      refreshSubcategoryColorsForParent(id);
    }
    revalidatePath("/categories");
    revalidatePath("/transactions");
    return { success: true, data: undefined };
  }

  const newParentId = parentId ?? existing.parentId;
  const parent = db
    .select()
    .from(categories)
    .where(eq(categories.id, newParentId))
    .get();
  if (!parent || parent.parentId !== null) {
    return { success: false, error: "Parent must be a main group" };
  }
  if (parent.type !== type) {
    return {
      success: false,
      error: "Sub-category type must match its main group",
    };
  }

  db.update(categories)
    .set({
      name,
      color,
      icon: icon ?? null,
      type,
      parentId: newParentId,
    })
    .where(eq(categories.id, id))
    .run();

  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, data: undefined };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!cat) {
    return { success: false, error: "Category not found" };
  }
  const child = db
    .select()
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1)
    .get();
  if (child) {
    return { success: false, error: "Remove sub-categories first" };
  }
  if (cat.isSystem) {
    if (cat.parentId === null) {
      suppressCategorySeedKey(mainSeedSuppressionKey(cat.name));
    } else {
      const parent = db
        .select()
        .from(categories)
        .where(eq(categories.id, cat.parentId))
        .get();
      if (parent?.parentId === null) {
        suppressCategorySeedKey(subSeedSuppressionKey(parent.name, cat.name));
      }
    }
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, data: undefined };
}

export async function createRule(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const parsed = RuleSchema.safeParse({
    categoryId: formData.get("categoryId"),
    pattern: formData.get("pattern"),
    patternType: formData.get("patternType") || "keyword",
    priority: formData.get("priority") || 0,
    confidence: formData.get("confidence") || 1,
    isUserDefined: true,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const ruleErr = assignableCategoryError(parsed.data.categoryId);
  if (ruleErr) {
    return { success: false, error: ruleErr };
  }

  const result = db
    .insert(categorisationRules)
    .values(parsed.data)
    .returning({ id: categorisationRules.id })
    .get();
  revalidatePath("/categories");
  return { success: true, data: { id: result.id } };
}

export async function deleteRule(id: number): Promise<ActionResult> {
  db.delete(categorisationRules).where(eq(categorisationRules.id, id)).run();
  revalidatePath("/categories");
  return { success: true, data: undefined };
}

export async function updateRule(
  id: number,
  data: {
    pattern: string;
    patternType: "keyword" | "regex" | "exact";
    priority: number;
  },
): Promise<ActionResult> {
  const parsed = z
    .object({
      pattern: z.string().min(1),
      patternType: z.enum(["regex", "keyword", "exact"]),
      priority: z.number(),
    })
    .safeParse(data);
  if (!parsed.success) return { success: false, error: "Validation failed" };
  if (parsed.data.patternType === "regex") {
    try {
      new RegExp(parsed.data.pattern, "i");
    } catch {
      return { success: false, error: "Invalid regex pattern" };
    }
  }
  db.update(categorisationRules)
    .set({
      pattern: parsed.data.pattern,
      patternType: parsed.data.patternType,
      priority: parsed.data.priority,
    })
    .where(eq(categorisationRules.id, id))
    .run();
  revalidatePath("/categories");
  return { success: true, data: undefined };
}

export async function createRulesBulk(
  rules: { pattern: string; categoryId: number }[],
): Promise<ActionResult<{ created: number }>> {
  let created = 0;
  for (const rule of rules) {
    const err = assignableCategoryError(rule.categoryId);
    if (err) continue;
    try {
      db.insert(categorisationRules)
        .values({
          categoryId: rule.categoryId,
          pattern: rule.pattern,
          patternType: "keyword",
          priority: 10,
          confidence: 0.9,
          isUserDefined: true,
        })
        .run();
      created++;
    } catch {
      // Skip duplicates
    }
  }
  revalidatePath("/categories");
  return { success: true, data: { created } };
}

export async function createRulesFromDrafts(
  drafts: RuleDraftInput[],
): Promise<ActionResult<{ created: number }>> {
  let created = 0;
  for (const d of drafts) {
    const err = assignableCategoryError(d.categoryId);
    if (err) continue;
    if (d.patternType === "regex") {
      try {
        new RegExp(d.pattern, "i");
      } catch {
        continue;
      }
    }
    try {
      db.insert(categorisationRules)
        .values({
          categoryId: d.categoryId,
          pattern: d.pattern,
          patternType: d.patternType,
          priority: 10,
          confidence: 0.9,
          isUserDefined: true,
        })
        .run();
      created++;
    } catch {
      // Skip duplicates or DB errors
    }
  }
  revalidatePath("/categories");
  return { success: true, data: { created } };
}

export async function createRulesFromDraftsAndApplyToUnverified(
  drafts: RuleDraftInput[],
): Promise<ActionResult<{ created: number; updated: number }>> {
  const createdResult = await createRulesFromDrafts(drafts);
  if (!createdResult.success) {
    return { success: false, error: "Failed to create rules" };
  }

  const applyResult = await applyDraftRulesToUnverifiedTransactions(drafts);
  if (!applyResult.success) {
    return { success: false, error: applyResult.error };
  }

  revalidatePath("/transactions");
  return {
    success: true,
    data: {
      created: createdResult.data.created,
      updated: applyResult.data.updated,
    },
  };
}

export type MatchingRuleInfo = {
  ruleId: number;
  pattern: string;
  patternType: "regex" | "keyword" | "exact";
  priority: number;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
};

export async function getMatchingRulesForTransaction(
  normalised: string,
): Promise<ActionResult<MatchingRuleInfo[]>> {
  const allRules = db
    .select({
      id: categorisationRules.id,
      pattern: categorisationRules.pattern,
      patternType: categorisationRules.patternType,
      priority: categorisationRules.priority,
      categoryId: categorisationRules.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(categorisationRules)
    .leftJoin(categories, eq(categorisationRules.categoryId, categories.id))
    .orderBy(desc(categorisationRules.priority))
    .all();

  const matches: MatchingRuleInfo[] = [];
  for (const rule of allRules) {
    const stub = ruleDraftStub(rule.pattern, rule.categoryId, rule.patternType);
    if (matchRule(normalised, stub)) {
      matches.push({
        ruleId: rule.id,
        pattern: rule.pattern,
        patternType: rule.patternType,
        priority: rule.priority,
        categoryId: rule.categoryId,
        categoryName: rule.categoryName ?? "",
        categoryColor: rule.categoryColor ?? "#6366f1",
      });
    }
  }

  return { success: true, data: matches };
}

export type RulePreviewInput = {
  pattern: string;
  categoryId: number;
  patternType?: "regex" | "keyword" | "exact";
};

export type RulePreviewMatch = {
  id: number;
  date: string;
  description: string;
  amount: number;
  accountName: string;
  accountCurrency: string;
};

export type RulePreviewResult = {
  key: string;
  count: number;
  matches: RulePreviewMatch[];
};

export async function previewUnverifiedMatchesForRules(
  rules: RulePreviewInput[],
): Promise<ActionResult<RulePreviewResult[]>> {
  if (rules.length === 0) return { success: true, data: [] };

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      normalised: transactions.normalised,
      amount: transactions.amount,
      accountName: accounts.name,
      accountCurrency: accounts.currency,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.categoryConfirmed, false))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();

  const data = rules.map((r) => {
    const patternType = r.patternType ?? "keyword";
    const stub = ruleDraftStub(r.pattern, r.categoryId, patternType);
    const matchedRows = rows.filter((row) => matchRule(row.normalised, stub));
    const key = `${r.pattern}::${r.categoryId}::${patternType}`;
    return {
      key,
      count: matchedRows.length,
      matches: matchedRows.slice(0, 100).map((row) => ({
        id: row.id,
        date: row.date,
        description: row.description,
        amount: row.amount,
        accountName: row.accountName ?? "Unknown",
        accountCurrency: row.accountCurrency ?? "AUD",
      })),
    };
  });

  return { success: true, data };
}

export async function createRulesBulkAndApplyToUnverified(
  rules: { pattern: string; categoryId: number }[],
): Promise<ActionResult<{ created: number; updated: number }>> {
  const createdResult = await createRulesBulk(rules);
  if (!createdResult.success) {
    return { success: false, error: "Failed to create rules" };
  }

  const applyResult = await applyKeywordRulesToUnverifiedTransactions(rules);
  if (!applyResult.success) {
    return { success: false, error: applyResult.error };
  }

  revalidatePath("/transactions");
  return {
    success: true,
    data: {
      created: createdResult.data.created,
      updated: applyResult.data.updated,
    },
  };
}
