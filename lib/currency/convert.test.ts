import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { DB } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { convertToHome } from "./convert";
import type { SupportedCurrency } from "./supported";

function createTestDb(): { db: DB; close: () => void } {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE \`fx_rates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`rate_date\` text NOT NULL,
      \`base_currency\` text NOT NULL,
      \`quote_currency\` text NOT NULL,
      \`rate\` real NOT NULL,
      \`fetched_at\` integer DEFAULT (unixepoch()) NOT NULL
    );
    CREATE UNIQUE INDEX \`fx_rates_date_base_quote\` ON \`fx_rates\` (\`rate_date\`, \`base_currency\`, \`quote_currency\`);
  `);
  const db = drizzle(sqlite) as unknown as DB;
  return {
    db,
    close: () => sqlite.close(),
  };
}

test("convertToHome uses cached rate GBP to AUD", (t) => {
  const { db, close } = createTestDb();
  t.after(close);

  db.insert(fxRates)
    .values({
      rateDate: "2024-06-01",
      baseCurrency: "GBP",
      quoteCurrency: "AUD",
      rate: 1.92,
      fetchedAt: Math.floor(Date.now() / 1000),
    })
    .run();

  const aud = "AUD" as SupportedCurrency;
  const gbp = "GBP" as SupportedCurrency;
  const out = convertToHome(db, 100, gbp, aud, "2024-06-01");
  assert.strictEqual(out, 192);
});

test("convertToHome same currency returns amount", (t) => {
  const { db, close } = createTestDb();
  t.after(close);

  const aud = "AUD" as SupportedCurrency;
  const out = convertToHome(db, -50.25, aud, aud, "2024-06-01");
  assert.strictEqual(out, -50.25);
});
