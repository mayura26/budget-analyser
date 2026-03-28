import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { deriveSubcategoryColor } from "@/lib/categories/colors";
import { isMainSeedSuppressed } from "@/lib/db/category-seed-suppressions";
import {
  allKnownMainNames,
  LEGACY_FLAT_TO_MAIN,
  MAIN_GROUP_DEFAULTS,
  MAIN_GROUP_NAMES,
  MAIN_RENAMES,
  REPARENT_SUB_TO_MAIN,
  SUB_NAME_UPGRADES,
} from "./category-taxonomy";
import { db } from "./index";
import {
  categories,
  categorisationRules,
  scheduledTransactions,
  transactions,
} from "./schema";

export { MAIN_GROUP_NAMES, MAIN_GROUP_DEFAULTS };

function getMainIdByName(name: string): number | undefined {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), isNull(categories.parentId)))
    .get();
  return row?.id;
}

/** Point transactions, rules, and schedules from one category to another. */
function reassignCategoryReferences(fromId: number, toId: number): void {
  db.update(transactions)
    .set({ categoryId: toId })
    .where(eq(transactions.categoryId, fromId))
    .run();
  db.update(categorisationRules)
    .set({ categoryId: toId })
    .where(eq(categorisationRules.categoryId, fromId))
    .run();
  db.update(scheduledTransactions)
    .set({ categoryId: toId })
    .where(eq(scheduledTransactions.categoryId, fromId))
    .run();
}

/**
 * Move subcategories from a duplicate main to the canonical main. When a sub's name
 * already exists under the canonical main, merge into the existing sub row.
 */
function moveSubcategoriesResolvingNameClashes(
  oldParentId: number,
  newParentId: number,
): void {
  const subs = db
    .select()
    .from(categories)
    .where(eq(categories.parentId, oldParentId))
    .all();
  for (const sub of subs) {
    const clash = db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.parentId, newParentId),
          eq(categories.name, sub.name),
        ),
      )
      .get();
    if (clash && clash.id !== sub.id) {
      reassignCategoryReferences(sub.id, clash.id);
      db.delete(categories).where(eq(categories.id, sub.id)).run();
    } else {
      db.update(categories)
        .set({ parentId: newParentId })
        .where(eq(categories.id, sub.id))
        .run();
    }
  }
}

/**
 * The DB already has a main row with the canonical name; merge the legacy-named
 * duplicate into it so we do not violate categories_main_name_unique.
 */
function mergeDuplicateMainIntoCanonical(
  duplicateMainId: number,
  canonicalMainId: number,
): void {
  moveSubcategoriesResolvingNameClashes(duplicateMainId, canonicalMainId);
  reassignCategoryReferences(duplicateMainId, canonicalMainId);
  db.delete(categories).where(eq(categories.id, duplicateMainId)).run();
}

export function normalizeMainGroupNamesAndInsertMissing(): void {
  for (const [oldName, newName] of Object.entries(MAIN_RENAMES)) {
    const def = MAIN_GROUP_DEFAULTS.find((d) => d.name === newName);
    if (!def) continue;
    const row = db
      .select()
      .from(categories)
      .where(and(eq(categories.name, oldName), isNull(categories.parentId)))
      .get();
    if (row) {
      const canonical = db
        .select()
        .from(categories)
        .where(and(eq(categories.name, def.name), isNull(categories.parentId)))
        .get();
      if (canonical && canonical.id !== row.id) {
        mergeDuplicateMainIntoCanonical(row.id, canonical.id);
      } else {
        db.update(categories)
          .set({ name: def.name })
          .where(eq(categories.id, row.id))
          .run();
      }
    }
  }

  for (const def of MAIN_GROUP_DEFAULTS) {
    if (isMainSeedSuppressed(def.name)) continue;
    const exists = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, def.name), isNull(categories.parentId)))
      .get();
    if (!exists) {
      db.insert(categories)
        .values({
          name: def.name,
          color: def.color,
          icon: def.icon,
          parentId: null,
          type: def.type,
          isSystem: true,
        })
        .run();
    }
  }
}

export function applySubcategoryTaxonomyAndColours(): void {
  for (const [oldName, newName] of Object.entries(SUB_NAME_UPGRADES)) {
    const rows = db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.name, oldName),
          sql`${categories.parentId} IS NOT NULL`,
          eq(categories.isSystem, true),
        ),
      )
      .all();
    for (const row of rows) {
      const clash = db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.name, newName),
            eq(categories.parentId, row.parentId as number),
          ),
        )
        .get();
      if (clash && clash.id !== row.id) continue;
      db.update(categories)
        .set({ name: newName })
        .where(eq(categories.id, row.id))
        .run();
    }
  }

  for (const { subName, targetMain } of REPARENT_SUB_TO_MAIN) {
    const mainId = getMainIdByName(targetMain);
    if (!mainId) continue;
    db.update(categories)
      .set({ parentId: mainId })
      .where(
        and(
          eq(categories.name, subName),
          eq(categories.isSystem, true),
          sql`${categories.parentId} IS NOT NULL`,
        ),
      )
      .run();
  }
}

export function refreshSubcategoryColorsForParent(mainId: number): void {
  const main = db
    .select()
    .from(categories)
    .where(eq(categories.id, mainId))
    .get();
  if (!main || main.parentId !== null) return;
  const subs = db
    .select()
    .from(categories)
    .where(eq(categories.parentId, mainId))
    .orderBy(asc(categories.id))
    .all();
  subs.forEach((sub, index) => {
    const color = deriveSubcategoryColor(main.color, index);
    db.update(categories).set({ color }).where(eq(categories.id, sub.id)).run();
  });
}

export function refreshSubcategoryColorsForAllMains(): void {
  const mains = db
    .select()
    .from(categories)
    .where(isNull(categories.parentId))
    .all();
  for (const main of mains) {
    refreshSubcategoryColorsForParent(main.id);
  }
}

export function migrateLegacyFlatCategoriesIfNeeded(): void {
  const all = db.select().from(categories).all();
  if (all.length === 0) return;

  const mainNameSet = allKnownMainNames();
  const needsLegacy = all.some(
    (c) =>
      c.parentId === null &&
      !mainNameSet.has(c.name) &&
      Object.hasOwn(LEGACY_FLAT_TO_MAIN, c.name),
  );
  if (!needsLegacy) return;

  for (const def of MAIN_GROUP_DEFAULTS) {
    if (isMainSeedSuppressed(def.name)) continue;
    const exists = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, def.name), isNull(categories.parentId)))
      .get();
    if (!exists) {
      db.insert(categories)
        .values({
          name: def.name,
          color: def.color,
          icon: def.icon,
          parentId: null,
          type: def.type,
          isSystem: true,
        })
        .run();
    }
  }

  const orphans = db
    .select()
    .from(categories)
    .where(isNull(categories.parentId))
    .all();
  for (const cat of orphans) {
    if (mainNameSet.has(cat.name)) continue;
    const mainName = LEGACY_FLAT_TO_MAIN[cat.name];
    if (mainName === undefined) continue;
    const mainId = getMainIdByName(mainName);
    if (mainId) {
      db.update(categories)
        .set({ parentId: mainId })
        .where(eq(categories.id, cat.id))
        .run();
    }
  }
}
