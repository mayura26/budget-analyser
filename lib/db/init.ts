import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";
import {
  migrateLegacyFlatCategoriesIfNeeded,
  normalizeMainGroupNamesAndInsertMissing,
  applySubcategoryTaxonomyAndColours,
} from "./category-hierarchy-migrate";

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
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
}
