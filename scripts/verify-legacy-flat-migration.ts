/**
 * Verifies migrateLegacyFlatCategoriesIfNeeded: user-created main groups stay
 * top-level; known legacy flat names (e.g. Income) are reparented under the
 * canonical main. Run: npm run test:legacy-migrate
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

async function main() {
  const dbPath = path.join(process.cwd(), "data", "legacy-migrate-verify.db");
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
    }
  }

  process.env.DATABASE_PATH = dbPath;

  const { initializeDatabase } = await import("../lib/db/init");
  const { migrateLegacyFlatCategoriesIfNeeded } = await import(
    "../lib/db/category-hierarchy-migrate"
  );

  initializeDatabase();

  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO categories (name, color, parent_id, type, is_system, created_at)
       VALUES ('UserCustomMain', '#112233', NULL, 'expense', 0, unixepoch())`,
    )
    .run();
  raw
    .prepare(
      `INSERT INTO categories (name, color, parent_id, type, is_system, created_at)
       VALUES ('Income', '#445566', NULL, 'income', 0, unixepoch())`,
    )
    .run();
  raw.close();

  migrateLegacyFlatCategoriesIfNeeded();

  const check = new Database(dbPath);
  const user = check
    .prepare(`SELECT parent_id FROM categories WHERE name = 'UserCustomMain'`)
    .get() as { parent_id: number | null };
  const income = check
    .prepare(`SELECT parent_id FROM categories WHERE name = 'Income'`)
    .get() as { parent_id: number | null };
  const moneyIn = check
    .prepare(
      `SELECT id FROM categories WHERE name = 'Money IN' AND parent_id IS NULL`,
    )
    .get() as { id: number };
  check.close();

  if (user.parent_id !== null) {
    console.error(
      "Expected UserCustomMain to remain a main group (parent_id NULL)",
    );
    process.exit(1);
  }
  if (income.parent_id === null) {
    console.error(
      "Expected legacy Income flat row to be reparented under Money IN",
    );
    process.exit(1);
  }
  if (income.parent_id !== moneyIn.id) {
    console.error("Expected Income under Money IN");
    process.exit(1);
  }

  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }

  console.log("legacy flat migration verification OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
