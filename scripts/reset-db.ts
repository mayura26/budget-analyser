/**
 * Removes the SQLite database files, then runs the same init as the app
 * (migrations + seed). Stop `npm run dev` first so the files are not locked.
 */
import fs from "fs";
import path from "path";

async function main() {
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "budget.db");

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const f of files) {
    try {
      fs.unlinkSync(f);
      console.log("Deleted:", f);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
    }
  }

  const { initializeDatabase } = await import("../lib/db/init");
  initializeDatabase();
  console.log("Database reset complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
