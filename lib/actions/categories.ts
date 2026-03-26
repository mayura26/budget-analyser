"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, categorisationRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/types";

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  parentId: z.coerce.number().optional(),
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

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: number }>> {
  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
    icon: formData.get("icon") || undefined,
    parentId: formData.get("parentId") || undefined,
    type: formData.get("type") || "expense",
  });

  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const result = db.insert(categories).values(parsed.data).returning({ id: categories.id }).get();
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
    parentId: formData.get("parentId") || undefined,
    type: formData.get("type") || "expense",
  });

  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  db.update(categories).set(parsed.data).where(eq(categories.id, id)).run();
  revalidatePath("/categories");
  return { success: true, data: undefined };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  const cat = db.select().from(categories).where(eq(categories.id, id)).get();
  if (cat?.isSystem) {
    return { success: false, error: "Cannot delete system category" };
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
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const result = db.insert(categorisationRules).values(parsed.data).returning({ id: categorisationRules.id }).get();
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
