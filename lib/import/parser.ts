import Papa from "papaparse";
import type { BankProfile } from "@/types";
import type { ParsedRow } from "@/types";
import { parseDateToISO } from "./profiles";

export type ColumnMapping = {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  dateFormat: string;
  negativeIsDebit: boolean;
  skipRows: number;
  delimiter: string;
  hasHeader: boolean;
  positionalColumns?: {
    date: number;
    description: number;
    amount?: number;
    debit?: number;
    credit?: number;
  };
};

export function profileToColumnMapping(profile: BankProfile): ColumnMapping {
  let hasHeader = true;
  let positionalColumns: ColumnMapping["positionalColumns"] | undefined;

  if (profile.extraMappings) {
    try {
      const parsed = JSON.parse(profile.extraMappings) as {
        hasHeader?: boolean;
        positionalColumns?: ColumnMapping["positionalColumns"];
      };
      if (typeof parsed.hasHeader === "boolean") {
        hasHeader = parsed.hasHeader;
      }
      if (parsed.positionalColumns) {
        positionalColumns = parsed.positionalColumns;
      }
    } catch {
      // Ignore invalid JSON and fall back to header-based parsing.
    }
  }

  return {
    dateColumn: profile.dateColumn,
    descriptionColumn: profile.descriptionColumn,
    amountColumn: profile.amountColumn ?? undefined,
    debitColumn: profile.debitColumn ?? undefined,
    creditColumn: profile.creditColumn ?? undefined,
    dateFormat: profile.dateFormat,
    negativeIsDebit: profile.negativeIsDebit,
    skipRows: profile.skipRows,
    delimiter: profile.delimiter,
    hasHeader,
    positionalColumns,
  };
}

export type ParseResult = {
  rows: ParsedRow[];
  headers: string[];
  errors: string[];
};

export function parseCSV(
  csvContent: string,
  mapping: ColumnMapping
): ParseResult {
  const errors: string[] = [];

  const rows: ParsedRow[] = [];

  if (!mapping.hasHeader) {
    const result = Papa.parse<string[]>(csvContent, {
      header: false,
      skipEmptyLines: true,
      delimiter: mapping.delimiter || ",",
    });

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        if (err.type !== "Delimiter") {
          errors.push(`Row ${err.row}: ${err.message}`);
        }
      }
    }

    const position = mapping.positionalColumns;
    const dateIdx = position?.date ?? 0;
    const descIdx = position?.description ?? 2;
    const amountIdx = position?.amount ?? 1;
    const debitIdx = position?.debit;
    const creditIdx = position?.credit;

    for (let i = mapping.skipRows; i < result.data.length; i++) {
      const row = result.data[i];

      const dateRaw = row[dateIdx]?.trim();
      const desc = row[descIdx]?.trim();

      if (!dateRaw || !desc) continue;

      const date = parseDateToISO(dateRaw, mapping.dateFormat);
      if (!date) {
        errors.push(`Invalid date "${dateRaw}" in row ${i + 1}`);
        continue;
      }

      let amount: number;
      if (amountIdx !== undefined && row[amountIdx] !== undefined) {
        const raw = normaliseAmount(row[amountIdx]);
        amount = parseFloat(raw);
        if (isNaN(amount)) {
          errors.push(`Invalid amount "${raw}" in row ${i + 1}`);
          continue;
        }
      } else if (
        debitIdx !== undefined &&
        creditIdx !== undefined &&
        (row[debitIdx] !== undefined || row[creditIdx] !== undefined)
      ) {
        const debitRaw = normaliseAmount(row[debitIdx] ?? "0");
        const creditRaw = normaliseAmount(row[creditIdx] ?? "0");
        const debit = parseFloat(debitRaw) || 0;
        const credit = parseFloat(creditRaw) || 0;
        amount = credit - debit;
      } else {
        errors.push(`No amount column found in row ${i + 1}`);
        continue;
      }

      // Normalise sign: negative = debit (money out)
      // If the CSV convention is that positive = debit, flip the sign
      if (!mapping.negativeIsDebit && amount > 0) {
        amount = -amount;
      }

      rows.push({
        date,
        description: desc,
        amount,
        rawRow: Object.fromEntries(row.map((value, idx) => [`col${idx}`, value])),
      });
    }

    return { rows, headers: [], errors };
  }

  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: mapping.delimiter || ",",
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      if (err.type !== "Delimiter") {
        errors.push(`Row ${err.row}: ${err.message}`);
      }
    }
  }

  const headers = result.meta.fields ?? [];

  for (let i = mapping.skipRows; i < result.data.length; i++) {
    const row = result.data[i];

    const dateRaw = row[mapping.dateColumn]?.trim();
    const desc = row[mapping.descriptionColumn]?.trim();

    if (!dateRaw || !desc) continue;

    const date = parseDateToISO(dateRaw, mapping.dateFormat);
    if (!date) {
      errors.push(`Invalid date "${dateRaw}" in row ${i + 1}`);
      continue;
    }

    let amount: number;

    if (mapping.amountColumn && row[mapping.amountColumn] !== undefined) {
      const raw = normaliseAmount(row[mapping.amountColumn]);
      amount = parseFloat(raw);
      if (isNaN(amount)) {
        errors.push(`Invalid amount "${raw}" in row ${i + 1}`);
        continue;
      }
    } else if (mapping.debitColumn && mapping.creditColumn) {
      const debitRaw = normaliseAmount(row[mapping.debitColumn] ?? "0");
      const creditRaw = normaliseAmount(row[mapping.creditColumn] ?? "0");
      const debit = parseFloat(debitRaw) || 0;
      const credit = parseFloat(creditRaw) || 0;
      // Debits are negative, credits are positive
      amount = credit - debit;
    } else {
      errors.push(`No amount column found in row ${i + 1}`);
      continue;
    }

    // Normalise sign: negative = debit (money out)
    // If the CSV convention is that positive = debit, flip the sign
    if (!mapping.negativeIsDebit && amount > 0) {
      amount = -amount;
    }

    rows.push({ date, description: desc, amount, rawRow: row });
  }

  return { rows, headers, errors };
}

function normaliseAmount(raw: string): string {
  return raw.trim().replace(/[",$]/g, "");
}

export function detectDelimiter(csvContent: string): string {
  const firstLine = csvContent.split("\n")[0];
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;

  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}
