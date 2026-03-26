import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";

let initialized = false;

export function initializeDatabase() {
  if (initialized) return;
  initialized = true;
  try {
    runMigrations();
    seedDatabase();
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
}
