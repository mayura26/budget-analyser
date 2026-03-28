import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";
import { migrateLegacyFlatCategoriesIfNeeded } from "./category-hierarchy-migrate";

let initialized = false;

export function initializeDatabase() {
  if (initialized) return;
  initialized = true;
  try {
    runMigrations();
    migrateLegacyFlatCategoriesIfNeeded();
    seedDatabase();
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
}
