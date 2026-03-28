import { eq, and, isNull, asc, sql } from "drizzle-orm";
import { db } from "./index";
import { categories } from "./schema";
import { deriveSubcategoryColor } from "@/lib/categories/colors";
import {
  MAIN_GROUP_DEFAULTS,
  MAIN_GROUP_NAMES,
  DEFAULT_SUBS,
  MAIN_RENAMES,
  LEGACY_FLAT_TO_MAIN,
  REPARENT_SUB_TO_MAIN,
  SUB_NAME_UPGRADES,
  allKnownMainNames,
  type MainGroupName,
} from "./category-taxonomy";

export { MAIN_GROUP_NAMES, MAIN_GROUP_DEFAULTS };

function getMainIdByName(name: string): number | undefined {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), isNull(categories.parentId)))
    .get();
  return row?.id;
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
      db.update(categories)
        .set({
          name: def.name,
          color: def.color,
          icon: def.icon,
          type: def.type,
        })
        .where(eq(categories.id, row.id))
        .run();
    }
  }

  for (const def of MAIN_GROUP_DEFAULTS) {
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

  for (const def of MAIN_GROUP_DEFAULTS) {
    db.update(categories)
      .set({
        color: def.color,
        icon: def.icon,
        type: def.type,
      })
      .where(and(eq(categories.name, def.name), isNull(categories.parentId)))
      .run();
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
          eq(categories.isSystem, true)
        )
      )
      .all();
    for (const row of rows) {
      const clash = db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.name, newName),
            eq(categories.parentId, row.parentId as number)
          )
        )
        .get();
      if (clash && clash.id !== row.id) continue;
      db.update(categories).set({ name: newName }).where(eq(categories.id, row.id)).run();
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
          sql`${categories.parentId} IS NOT NULL`
        )
      )
      .run();
  }

  for (const sub of DEFAULT_SUBS) {
    const pid = getMainIdByName(sub.main);
    if (!pid) continue;
    const row = db
      .select()
      .from(categories)
      .where(and(eq(categories.name, sub.name), eq(categories.parentId, pid)))
      .get();
    if (row) {
      db.update(categories)
        .set({
          color: sub.color,
          icon: sub.icon,
          type: sub.type,
        })
        .where(eq(categories.id, row.id))
        .run();
    }
  }
}

export function refreshSubcategoryColorsForParent(mainId: number): void {
  const main = db.select().from(categories).where(eq(categories.id, mainId)).get();
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
    (c) => c.parentId === null && !mainNameSet.has(c.name)
  );
  if (!needsLegacy) return;

  for (const def of MAIN_GROUP_DEFAULTS) {
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

  const orphans = db.select().from(categories).where(isNull(categories.parentId)).all();
  for (const cat of orphans) {
    if (mainNameSet.has(cat.name)) continue;
    const mainName = LEGACY_FLAT_TO_MAIN[cat.name] ?? ("Living Costs" as MainGroupName);
    const mainId = getMainIdByName(mainName);
    if (mainId) {
      db.update(categories).set({ parentId: mainId }).where(eq(categories.id, cat.id)).run();
    }
  }
}
