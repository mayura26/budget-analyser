// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (
  buf: Buffer,
) => Promise<{ text: string }> = require("pdf-parse");

import type { ParseResult } from "./parser";

const MONTH_MAP: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

// Matches: "17 Jan 2026 Transfer from xx2394 CommBank app $3,233.29 $3,233.29"
const ROW_PATTERN =
  /^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+(.+?)\s+(-?\$[\d,]+\.\d{2})\s+(-?\$[\d,]+\.\d{2})\s*$/;

function parseDate(s: string): string {
  const [day, mon, year] = s.trim().split(/\s+/);
  return `${year}-${MONTH_MAP[mon]}-${day.padStart(2, "0")}`;
}

function parseAmount(s: string): number {
  const negative = s.startsWith("-");
  const num = parseFloat(s.replace(/[-$,]/g, ""));
  return negative ? -num : num;
}

export async function parseCommBankPDF(buffer: Buffer): Promise<ParseResult> {
  const { text } = await pdfParse(buffer);

  const rows: ParseResult["rows"] = [];
  const errors: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = ROW_PATTERN.exec(trimmed);
    if (!match) continue;

    const [, dateStr, description, amountStr] = match;
    const month = dateStr.trim().split(/\s+/)[1];
    if (!MONTH_MAP[month]) {
      errors.push(`Unrecognised month in: ${trimmed}`);
      continue;
    }

    rows.push({
      date: parseDate(dateStr),
      description: description.trim(),
      amount: parseAmount(amountStr),
      rawRow: {
        date: dateStr,
        description: description.trim(),
        amount: amountStr,
      },
    });
  }

  return {
    rows,
    headers: ["Date", "Transaction details", "Amount", "Balance"],
    errors,
  };
}
