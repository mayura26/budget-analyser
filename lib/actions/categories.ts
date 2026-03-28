"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { applyKeywordRulesToUnverifiedTransactions } from "@/lib/actions/transactions";
import { assignableCategoryError } from "@/lib/categories/assignable";
import { serializeCategoryDisplayName } from "@/lib/categories/display-name";
import { keywordRuleStub, matchRule } from "@/lib/categorisation/rule-matcher";
import { db } from "@/lib/db";
import { refreshSubcategoryColorsForParent } from "@/lib/db/category-hierarchy-migrate";
import {
  mainSeedSuppressionKey,
  subSeedSuppressionKey,
  suppressCategorySeedKey,
} from "@/lib/db/category-seed-suppressions";
import { categories, categorisationRules, transactions } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  type: z.enum(["income", "expense", "transfer"]).default("expense"),
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
  const parsed = CategorySchema.safeParse({
    name: categoryNameFromFormData(formData),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
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
  const { name, color, icon, type } = parsed.data;

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
  const parsed = CategorySchema.safeParse({
    name: categoryNameFromFormData(formData),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
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
  const { name, color, icon, type } = parsed.data;

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

export async function previewUnverifiedMatchesForRules(
  rules: { pattern: string; categoryId: number }[],
): Promise<ActionResult<{ key: string; count: number }[]>> {
  if (rules.length === 0) return { success: true, data: [] };

  const rows = db
    .select({ normalised: transactions.normalised })
    .from(transactions)
    .where(eq(transactions.categoryConfirmed, false))
    .all();

  const data = rules.map((r) => {
    const stub = keywordRuleStub(r.pattern, r.categoryId);
    const count = rows.filter((row) => matchRule(row.normalised, stub)).length;
    return { key: `${r.pattern}::${r.categoryId}`, count };
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
