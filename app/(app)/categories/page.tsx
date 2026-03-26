export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { categories, categorisationRules } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { CategoryList } from "@/components/categories/category-list";

export default function CategoriesPage() {
  const allCategories = db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      parentId: categories.parentId,
      type: categories.type,
      isSystem: categories.isSystem,
      createdAt: categories.createdAt,
      ruleCount: sql<number>`COUNT(${categorisationRules.id})`,
    })
    .from(categories)
    .leftJoin(categorisationRules, eq(categories.id, categorisationRules.categoryId))
    .groupBy(categories.id)
    .all();

  const allRules = db
    .select({
      id: categorisationRules.id,
      categoryId: categorisationRules.categoryId,
      pattern: categorisationRules.pattern,
      patternType: categorisationRules.patternType,
      priority: categorisationRules.priority,
      confidence: categorisationRules.confidence,
      isUserDefined: categorisationRules.isUserDefined,
      createdAt: categorisationRules.createdAt,
      updatedAt: categorisationRules.updatedAt,
    })
    .from(categorisationRules)
    .all();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Categories & Rules</h1>
      <CategoryList categories={allCategories as any} rules={allRules} />
    </div>
  );
}
