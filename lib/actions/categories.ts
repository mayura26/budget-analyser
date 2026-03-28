"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, categorisationRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/types";
import { assignableCategoryError } from "@/lib/categories/assignable";
import { refreshSubcategoryColorsForParent } from "@/lib/db/category-hierarchy-migrate";

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

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: number }>> {
  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const parentId = parseParentId(formData);
  const { name, color, icon, type } = parsed.data;

  if (parentId) {
    const parent = db.select().from(categories).where(eq(categories.id, parentId)).get();
    if (!parent || parent.parentId !== null) {
      return { success: false, error: "Parent must be a main group" };
    }
    if (parent.type !== type) {
      return { success: false, error: "Sub-category type must match its main group" };
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
  formData: FormData
): Promise<ActionResult> {
  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    type: formData.get("type") || "expense",
  });

  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  const existing = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) {
    return { success: false, error: "Category not found" };
  }

  const parentId = parseParentId(formData);
  const { name, color, icon, type } = parsed.data;

  if (existing.parentId === null) {
    const child = db.select().from(categories).where(eq(categories.parentId, id)).limit(1).get();
    if (child && parentId !== undefined) {
      return { success: false, error: "Remove sub-categories before changing a main group" };
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
  const parent = db.select().from(categories).where(eq(categories.id, newParentId)).get();
  if (!parent || parent.parentId !== null) {
    return { success: false, error: "Parent must be a main group" };
  }
  if (parent.type !== type) {
    return { success: false, error: "Sub-category type must match its main group" };
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
  if (cat?.isSystem) {
    return { success: false, error: "Cannot delete system category" };
  }
  const child = db.select().from(categories).where(eq(categories.parentId, id)).limit(1).get();
  if (child) {
    return { success: false, error: "Remove sub-categories first" };
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { success: true, data: undefined };
}

export async function createRule(
  _prev: ActionResult | null,
  formData: FormData
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
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
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
  rules: { pattern: string; categoryId: number }[]
): Promise<ActionResult<{ created: number }>> {
  let created = 0;
  for (const rule of rules) {
    const err = assignableCategoryError(rule.categoryId);
    if (err) continue;
    try {
      db.insert(categorisationRules).values({
        categoryId: rule.categoryId,
        pattern: rule.pattern,
        patternType: "keyword",
        priority: 10,
        confidence: 0.9,
        isUserDefined: true,
      }).run();
      created++;
    } catch {
      // Skip duplicates
    }
  }
  revalidatePath("/categories");
  return { success: true, data: { created } };
}
