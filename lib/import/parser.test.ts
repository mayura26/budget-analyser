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
