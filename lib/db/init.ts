import { recomputeAllGroupedAccountColors } from "@/lib/accounts/account-colors";
import {
  applySubcategoryTaxonomyAndColours,
  migrateLegacyFlatCategoriesIfNeeded,
  normalizeMainGroupNamesAndInsertMissing,
} from "./category-hierarchy-migrate";
import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";

let initialized = false;

export function initializeDatabase() {
  if (initialized) return;
  initialized = true;
  try {
    runMigrations();
    normalizeMainGroupNamesAndInsertMissing();
    migrateLegacyFlatCategoriesIfNeeded();
    applySubcategoryTaxonomyAndColours();
    seedDatabase();
    recomputeAllGroupedAccountColors();
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
}
