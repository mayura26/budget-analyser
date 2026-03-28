import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export const CATEGORY_SEED_SUPPRESSIONS_KEY = "category_seed_suppressions";

export function mainSeedSuppressionKey(mainName: string): string {
  return `main:${mainName}`;
}

export function subSeedSuppressionKey(
  mainGroupName: string,
  subName: string,
): string {
  return `sub:${mainGroupName}:${subName}`;
}

function parseSuppressions(raw: string | null | undefined): Set<string> {
  if (raw == null || raw === "") return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function readCategorySeedSuppressions(): Set<string> {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, CATEGORY_SEED_SUPPRESSIONS_KEY))
    .get();
  return parseSuppressions(row?.value);
}

export function suppressCategorySeedKey(key: string): void {
  const set = readCategorySeedSuppressions();
  if (set.has(key)) return;
  set.add(key);
  const now = Math.floor(Date.now() / 1000);
  const value = JSON.stringify([...set]);
  db.insert(settings)
    .values({
      key: CATEGORY_SEED_SUPPRESSIONS_KEY,
      value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export function isMainSeedSuppressed(mainName: string): boolean {
  return readCategorySeedSuppressions().has(mainSeedSuppressionKey(mainName));
}

export function isSubSeedSuppressed(
  mainGroupName: string,
  subName: string,
): boolean {
  return readCategorySeedSuppressions().has(
    subSeedSuppressionKey(mainGroupName, subName),
  );
}
