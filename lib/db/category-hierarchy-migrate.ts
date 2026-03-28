import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "./index";
import { categories } from "./schema";
import { deriveSubcategoryColor } from "@/lib/categories/colors";

/** Top-level group names (parent_id null). Must match seed defaults. */
export const MAIN_GROUP_NAMES = [
  "Money in",
  "Living costs",
  "Savings",
  "Enjoyment",
  "One-off & irregular",
  "Transfers",
] as const;

const LEGACY_FLAT_TO_MAIN: Record<string, (typeof MAIN_GROUP_NAMES)[number]> = {
  Groceries: "Living costs",
  Dining: "Living costs",
  Transport: "Living costs",
  Utilities: "Living costs",
  Health: "Living costs",
  Housing: "Living costs",
  Insurance: "Living costs",
  Entertainment: "Enjoyment",
  Shopping: "Enjoyment",
  Travel: "One-off & irregular",
  Misc: "One-off & irregular",
  Income: "Money in",
  Transfer: "Transfers",
  "Credit Card Payment": "Transfers",
};

export const MAIN_GROUP_DEFAULTS: {
  name: (typeof MAIN_GROUP_NAMES)[number];
  color: string;
  icon: string;
  type: "income" | "expense" | "transfer";
}[] = [
  { name: "Money in", color: "#10b981", icon: "Wallet", type: "income" },
  { name: "Living costs", color: "#64748b", icon: "Home", type: "expense" },
  { name: "Savings", color: "#0ea5e9", icon: "PiggyBank", type: "expense" },
  { name: "Enjoyment", color: "#f59e0b", icon: "Sparkles", type: "expense" },
  { name: "One-off & irregular", color: "#06b6d4", icon: "Plane", type: "expense" },
  { name: "Transfers", color: "#6366f1", icon: "ArrowLeftRight", type: "transfer" },
];

function getMainIdByName(name: (typeof MAIN_GROUP_NAMES)[number]): number | undefined {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), isNull(categories.parentId)))
    .get();
  return row?.id;
}

/** Recompute sub-category colours under one main group (by main row id). */
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

/** Recompute sub-category colours from each main group's base colour. */
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

/**
 * One-time upgrade: flat legacy rows (parent null, not a main group name) get a parent main row
 * and derived colours.
 */
export function migrateLegacyFlatCategoriesIfNeeded(): void {
  const all = db.select().from(categories).all();
  if (all.length === 0) return;

  const mainNameSet = new Set<string>(MAIN_GROUP_NAMES);
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
    const mainName = (LEGACY_FLAT_TO_MAIN[cat.name] ?? "Living costs") as (typeof MAIN_GROUP_NAMES)[number];
    const mainId = getMainIdByName(mainName);
    if (mainId) {
      db.update(categories).set({ parentId: mainId }).where(eq(categories.id, cat.id)).run();
    }
  }

  refreshSubcategoryColorsForAllMains();
}
