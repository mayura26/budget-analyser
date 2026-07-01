import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { generateFingerprint } from "../lib/import/fingerprint";
import { normaliseDescription } from "../lib/import/normaliser";
import { repairWiseTransactionDates } from "./repair-wise-transaction-dates";

function insertWiseTransaction(
  db: Database.Database,
  accountId: number,
  date: string,
  amount: number,
  description: string,
) {
  const normalised = normaliseDescription(description);
  const fingerprint = generateFingerprint(accountId, date, amount, normalised);
  db.prepare(
    `INSERT INTO transactions
       (account_id, fingerprint, date, description, normalised, amount, source_timestamp_utc, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, unixepoch())`,
  ).run(accountId, fingerprint, date, description, normalised, amount);
  return fingerprint;
}

function makeDb(dir: string): string {
  const dbPath = path.join(dir, "budget.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE bank_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank_profile_id INTEGER,
      currency TEXT NOT NULL
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      normalised TEXT NOT NULL,
      amount REAL NOT NULL,
      source_timestamp_utc TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  db.prepare("INSERT INTO bank_profiles (id, name) VALUES (1, 'Wise')").run();
  db.prepare(
    "INSERT INTO accounts (id, name, bank_profile_id, currency) VALUES (1, 'Wise AUD', 1, 'AUD')",
  ).run();
  insertWiseTransaction(db, 1, "2026-01-15", -10, "Sydney crossing");
  insertWiseTransaction(db, 1, "2026-07-01", -20, "Winter conflict");
  insertWiseTransaction(db, 1, "2026-07-02", -20, "Winter conflict");
  db.close();
  return dbPath;
}

function makeCsv(dir: string): string {
  const csvPath = path.join(dir, "wise.csv");
  fs.writeFileSync(
    csvPath,
    `ID,Status,Direction,Created on,Finished on,Source fee amount,Source fee currency,Target fee amount,Target fee currency,Source name,Source amount (after fees),Source currency,Target name,Target amount (after fees),Target currency,Exchange rate,Reference,Batch,Created by,Category,Note
CARD-1,COMPLETED,OUT,2026-01-15 13:30:00,2026-01-15 13:31:00,,,,,,7.00,USD,Sydney crossing,10,AUD,1.4,,,,,
CARD-2,COMPLETED,OUT,2026-07-01 14:30:00,2026-07-01 14:31:00,,,,,,14.00,USD,Winter conflict,20,AUD,1.4,,,,,
`,
    "utf-8",
  );
  return csvPath;
}

test("repairWiseTransactionDates dry-run and apply update legacy Wise dates without overwriting conflicts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wise-repair-"));
  try {
    const databasePath = makeDb(dir);
    const csvPath = makeCsv(dir);

    const dryRun = repairWiseTransactionDates({ csvPath, databasePath });
    assert.strictEqual(dryRun.dryRun, true);
    assert.strictEqual(dryRun.updated, 1);
    assert.strictEqual(dryRun.skippedConflicts, 1);

    let db = new Database(databasePath, { readonly: true });
    const before = db
      .prepare(
        "SELECT date, source_timestamp_utc FROM transactions WHERE description = ? ORDER BY id LIMIT 1",
      )
      .get("Sydney crossing") as {
      date: string;
      source_timestamp_utc: string | null;
    };
    db.close();
    assert.strictEqual(before.date, "2026-01-15");
    assert.strictEqual(before.source_timestamp_utc, null);

    const applied = repairWiseTransactionDates({
      csvPath,
      databasePath,
      dryRun: false,
    });
    assert.strictEqual(applied.updated, 1);
    assert.strictEqual(applied.skippedConflicts, 1);

    db = new Database(databasePath, { readonly: true });
    const after = db
      .prepare(
        "SELECT date, fingerprint, source_timestamp_utc FROM transactions WHERE description = ? ORDER BY id LIMIT 1",
      )
      .get("Sydney crossing") as {
      date: string;
      fingerprint: string;
      source_timestamp_utc: string | null;
    };
    const conflictRows = db
      .prepare(
        "SELECT date FROM transactions WHERE description = ? ORDER BY date",
      )
      .all("Winter conflict") as { date: string }[];
    db.close();

    assert.strictEqual(after.date, "2026-01-16");
    assert.strictEqual(after.source_timestamp_utc, "2026-01-15T13:30:00.000Z");
    assert.strictEqual(
      after.fingerprint,
      generateFingerprint(
        1,
        "2026-01-16",
        -10,
        normaliseDescription("Sydney crossing"),
      ),
    );
    assert.deepStrictEqual(
      conflictRows.map((row) => row.date),
      ["2026-07-01", "2026-07-02"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
