import assert from "node:assert";
import { test } from "node:test";
import type { ColumnMapping } from "./parser";
import { parseCSV } from "./parser";

function amexLikeMapping(extras?: Partial<ColumnMapping>): ColumnMapping {
  return {
    dateColumn: "Date",
    descriptionColumn: "Description",
    amountColumn: "Amount",
    dateFormat: "DD/MM/YYYY",
    skipRows: 0,
    delimiter: ",",
    hasHeader: true,
    negativeIsDebit: false,
    descriptionCreditSubstrings: ["ONLINE PAYMENT RECEIVED"],
    ...extras,
  };
}

function wiseMapping(extras?: Partial<ColumnMapping>): ColumnMapping {
  return {
    dateColumn: "Created on",
    descriptionColumn: "Target name",
    amountColumn: "Source amount (after fees)",
    dateFormat: "YYYY-MM-DD HH:mm",
    skipRows: 0,
    delimiter: ",",
    hasHeader: true,
    negativeIsDebit: true,
    directionColumn: "Direction",
    outValues: ["OUT"],
    inValues: ["IN"],
    sourceTimeZone: "UTC",
    targetTimeZone: "Australia/Sydney",
    ...extras,
  };
}

test("Amex-style card payment row becomes positive credit", () => {
  const csv = `Date,Description,Amount
07/05/2026,ONLINE PAYMENT RECEIVED - THANKYOU W8295,-1500.00
07/05/2026,COFFEE SHOP,12.50`;
  const { rows } = parseCSV(csv, amexLikeMapping());
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]?.amount, 1500);
  assert.strictEqual(rows[1]?.amount, -12.5);
});

test("charges without payment phrase keep normal Amex sign convention", () => {
  const csv = `Date,Description,Amount
26/04/2026,AMAZON AU,90.00`;
  const { rows } = parseCSV(csv, amexLikeMapping());
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.amount, -90);
});

test("description credit substrings absent leaves negative CSV amounts as-is", () => {
  const csv = `Date,Description,Amount
07/05/2026,ONLINE PAYMENT RECEIVED - THANKYOU,-1500.00`;
  const { rows } = parseCSV(
    csv,
    amexLikeMapping({ descriptionCreditSubstrings: undefined }),
  );
  assert.strictEqual(rows[0]?.amount, -1500);
});

test("Wise UTC timestamp converts to next Sydney daylight-saving date", () => {
  const csv = `Created on,Direction,Target name,Source amount (after fees)
2026-01-15 13:30:00,OUT,Sydney crossing,10.00`;
  const { rows } = parseCSV(csv, wiseMapping());
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.date, "2026-01-16");
  assert.strictEqual(rows[0]?.legacyDate, "2026-01-15");
  assert.strictEqual(rows[0]?.sourceTimestampUtc, "2026-01-15T13:30:00.000Z");
});

test("Wise UTC timestamp uses Sydney standard-time offset outside daylight saving", () => {
  const csv = `Created on,Direction,Target name,Source amount (after fees)
2026-07-01 14:30:00,OUT,Sydney winter crossing,10.00`;
  const { rows } = parseCSV(csv, wiseMapping());
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.date, "2026-07-02");
  assert.strictEqual(rows[0]?.sourceTimestampUtc, "2026-07-01T14:30:00.000Z");
});

test("timestamp-like dates without timezone mapping keep existing local-date parsing", () => {
  const csv = `Created on,Direction,Target name,Source amount (after fees)
2026-01-15 13:30:00,OUT,Legacy timestamp parsing,10.00`;
  const { rows } = parseCSV(
    csv,
    wiseMapping({ sourceTimeZone: undefined, targetTimeZone: undefined }),
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.date, "2026-01-15");
  assert.strictEqual(rows[0]?.legacyDate, undefined);
  assert.strictEqual(rows[0]?.sourceTimestampUtc, undefined);
});
