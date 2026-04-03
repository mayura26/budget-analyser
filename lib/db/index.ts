import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "budget.db");

/**
 * `next build` collects page data with multiple Node workers. Each imports this
 * module and would open the same SQLite path (SQLITE_BUSY). Use an ephemeral DB
 * during the build only; runtime (`next start`) uses the real file.
 */
function shouldUseEphemeralDatabaseForBuild(): boolean {
  if (process.env.npm_lifecycle_event === "build") return true;
  const argv = process.argv;
  if (!argv.includes("build")) return false;
  return argv.some((arg) => {
    if (arg === "next") return true;
    const normalized = arg.replaceAll("\\", "/");
    return /[/]next(\.js)?$/i.test(normalized);
  });
}

const sqlitePath = shouldUseEphemeralDatabaseForBuild() ? ":memory:" : dbPath;

if (sqlitePath !== ":memory:") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const sqlite = new Database(sqlitePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

/** True when the app uses a file-backed SQLite database (not build-time :memory:). */
export function isFileBackedDatabase(): boolean {
  return sqlitePath !== ":memory:";
}

/**
 * Writes a consistent snapshot of the open database (including WAL) to a temp
 * file via SQLite backup, then returns its bytes. Returns null if not file-backed.
 */
export async function exportDatabaseFileBuffer(): Promise<Buffer | null> {
  if (sqlitePath === ":memory:") return null;
  const tmp = path.join(
    os.tmpdir(),
    `budget-export-${process.pid}-${Date.now()}.db`,
  );
  try {
    await sqlite.backup(tmp);
    return fs.readFileSync(tmp);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
