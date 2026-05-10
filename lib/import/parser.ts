import Papa from "papaparse";
import type { BankProfile, ParsedRow } from "@/types";
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
  directionColumn?: string;
  outValues?: string[];
  inValues?: string[];
  descriptionFallbackColumns?: string[];
  sourceAmountColumn?: string;
  sourceCurrencyColumn?: string;
  targetAmountColumn?: string;
  targetCurrencyColumn?: string;
  accountCurrency?: string;
  merchantColumn?: string;
  accountReferenceColumn?: string;
  pendingFlagColumn?: string;
  pendingWhenEmpty?: boolean;
  /** Omit rows whose Direction matches any value (case-insensitive). */
  skipDirections?: string[];
  skipTransactionIdColumn?: string;
  /** Omit rows whose transaction id starts with any prefix (case-insensitive). */
  skipTransactionIdPrefixes?: string[];
  /** When Direction matches inValues, prefer this column for description. */
  descriptionInColumn?: string;
  /** When Direction matches outValues, prefer this column for description. */
  descriptionOutColumn?: string;
  /**
   * Case-insensitive substrings on the resolved description. If any match, the
   * amount is treated as an inward credit (positive) after normal sign rules —
   * e.g. Amex card payments appear negative in CSV but should match bank debits for linking.
   */
  descriptionCreditSubstrings?: string[];
};

export function profileToColumnMapping(profile: BankProfile): ColumnMapping {
  let hasHeader = true;
  let positionalColumns: ColumnMapping["positionalColumns"] | undefined;

  if (profile.extraMappings) {
    try {
      const parsed = JSON.parse(profile.extraMappings) as {
        hasHeader?: boolean;
        positionalColumns?: ColumnMapping["positionalColumns"];
        directionColumn?: string;
        outValues?: string[];
        inValues?: string[];
        descriptionFallbackColumns?: string[];
        sourceAmountColumn?: string;
        sourceCurrencyColumn?: string;
        targetAmountColumn?: string;
        targetCurrencyColumn?: string;
        merchantColumn?: string;
        accountReferenceColumn?: string;
        pendingFlagColumn?: string;
        pendingWhenEmpty?: boolean;
        skipDirections?: string[];
        skipTransactionIdColumn?: string;
        skipTransactionIdPrefixes?: string[];
        descriptionInColumn?: string;
        descriptionOutColumn?: string;
        descriptionCreditSubstrings?: string[];
      };
      if (typeof parsed.hasHeader === "boolean") {
        hasHeader = parsed.hasHeader;
      }
      if (parsed.positionalColumns) {
        positionalColumns = parsed.positionalColumns;
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
        directionColumn: parsed.directionColumn,
        outValues: parsed.outValues,
        inValues: parsed.inValues,
        descriptionFallbackColumns: parsed.descriptionFallbackColumns,
        sourceAmountColumn: parsed.sourceAmountColumn,
        sourceCurrencyColumn: parsed.sourceCurrencyColumn,
        targetAmountColumn: parsed.targetAmountColumn,
        targetCurrencyColumn: parsed.targetCurrencyColumn,
        merchantColumn: parsed.merchantColumn,
        accountReferenceColumn: parsed.accountReferenceColumn,
        pendingFlagColumn: parsed.pendingFlagColumn,
        pendingWhenEmpty: parsed.pendingWhenEmpty,
        skipDirections: parsed.skipDirections,
        skipTransactionIdColumn: parsed.skipTransactionIdColumn,
        skipTransactionIdPrefixes: parsed.skipTransactionIdPrefixes,
        descriptionInColumn: parsed.descriptionInColumn,
        descriptionOutColumn: parsed.descriptionOutColumn,
        descriptionCreditSubstrings:
          parsed.descriptionCreditSubstrings &&
          parsed.descriptionCreditSubstrings.length > 0
            ? parsed.descriptionCreditSubstrings
            : undefined,
      };
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
  mapping: ColumnMapping,
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
        if (Number.isNaN(amount)) {
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

      amount = normaliseSignedAmount(amount, mapping);
      amount = creditAmountIfDescriptionMatches(amount, desc, mapping);

      rows.push({
        date,
        description: desc,
        amount,
        rawRow: Object.fromEntries(
          row.map((value, idx) => [`col${idx}`, value]),
        ),
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

    if (shouldSkipMappedRow(row, mapping)) continue;

    const dateRaw = row[mapping.dateColumn]?.trim();
    const desc = resolveDescription(row, mapping);

    if (!dateRaw || !desc) continue;

    const date = parseDateToISO(dateRaw, mapping.dateFormat);
    if (!date) {
      errors.push(`Invalid date "${dateRaw}" in row ${i + 1}`);
      continue;
    }

    let amount: number;
    let currency: string | undefined;

    const resolved = resolveMappedAmountAndCurrency(row, mapping);
    const resolvedAmount = resolved?.amount ?? null;
    if (resolvedAmount !== null) {
      const raw = normaliseAmount(resolvedAmount);
      amount = parseFloat(raw);
      if (Number.isNaN(amount)) {
        errors.push(`Invalid amount "${raw}" in row ${i + 1}`);
        continue;
      }
      currency = resolved?.currency;
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

    amount = normaliseSignedAmount(amount, mapping, row);
    amount = creditAmountIfDescriptionMatches(amount, desc, mapping);

    const merchant = mapping.merchantColumn
      ? row[mapping.merchantColumn]?.trim() || undefined
      : undefined;
    const accountReference = mapping.accountReferenceColumn
      ? row[mapping.accountReferenceColumn]?.trim() || undefined
      : undefined;
    let pending: boolean | undefined;
    if (mapping.pendingFlagColumn) {
      const flagRaw = row[mapping.pendingFlagColumn];
      const flag = (flagRaw ?? "").trim();
      if (mapping.pendingWhenEmpty) {
        pending = flag === "";
      } else {
        pending = flag !== "";
      }
    }

    rows.push({
      date,
      description: desc,
      amount,
      currency,
      rawRow: row,
      merchant,
      accountReference,
      pending,
    });
  }

  return { rows, headers, errors };
}

function normaliseAmount(raw: string): string {
  return raw.trim().replace(/[",$]/g, "");
}

function creditAmountIfDescriptionMatches(
  amount: number,
  description: string,
  mapping: ColumnMapping,
): number {
  const needles = mapping.descriptionCreditSubstrings;
  if (!needles?.length) return amount;
  const upper = description.toUpperCase();
  for (const n of needles) {
    if (n && upper.includes(n.toUpperCase())) {
      return Math.abs(amount);
    }
  }
  return amount;
}

function normaliseSignedAmount(
  amount: number,
  mapping: ColumnMapping,
  row?: Record<string, string>,
): number {
  const directionColumn = mapping.directionColumn;
  if (directionColumn && row) {
    const direction = (row[directionColumn] ?? "").trim().toUpperCase();
    const outValues = new Set(
      (mapping.outValues ?? []).map((v) => v.toUpperCase()),
    );
    const inValues = new Set(
      (mapping.inValues ?? []).map((v) => v.toUpperCase()),
    );
    const absoluteAmount = Math.abs(amount);
    if (outValues.has(direction)) return -absoluteAmount;
    if (inValues.has(direction)) return absoluteAmount;
  }

  // Normalise sign: negative = debit (money out)
  // If the CSV convention is that positive = debit, flip the sign
  if (!mapping.negativeIsDebit && amount > 0) {
    return -amount;
  }
  return amount;
}

function shouldSkipMappedRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
): boolean {
  const idColumn = mapping.skipTransactionIdColumn;
  const idPrefixes = mapping.skipTransactionIdPrefixes;
  if (idColumn && idPrefixes && idPrefixes.length > 0) {
    const rawId = (row[idColumn] ?? "").trim();
    if (rawId) {
      const upperId = rawId.toUpperCase();
      for (const prefix of idPrefixes) {
        if (upperId.startsWith(prefix.trim().toUpperCase())) return true;
      }
    }
  }

  const dirColumn = mapping.directionColumn;
  const skipDirs = mapping.skipDirections;
  if (dirColumn && skipDirs && skipDirs.length > 0) {
    const direction = (row[dirColumn] ?? "").trim().toUpperCase();
    const skipSet = new Set(skipDirs.map((d) => d.trim().toUpperCase()));
    if (direction && skipSet.has(direction)) return true;
  }

  return false;
}

function resolveDescription(
  row: Record<string, string>,
  mapping: ColumnMapping,
): string {
  const directionColumn = mapping.directionColumn;
  const inCol = mapping.descriptionInColumn;
  const outCol = mapping.descriptionOutColumn;
  if (
    directionColumn &&
    inCol &&
    outCol &&
    mapping.inValues?.length &&
    mapping.outValues?.length
  ) {
    const direction = (row[directionColumn] ?? "").trim().toUpperCase();
    const inValues = new Set(
      mapping.inValues.map((v) => v.trim().toUpperCase()),
    );
    const outValues = new Set(
      mapping.outValues.map((v) => v.trim().toUpperCase()),
    );
    if (inValues.has(direction)) {
      const primary = row[inCol]?.trim();
      if (primary) return primary;
    } else if (outValues.has(direction)) {
      const primary = row[outCol]?.trim();
      if (primary) return primary;
    }
  }

  const seen = new Set<string>();
  const chain = [
    mapping.descriptionColumn,
    ...(mapping.descriptionFallbackColumns ?? []),
  ];
  for (const column of chain) {
    if (!column || seen.has(column)) continue;
    seen.add(column);
    const value = row[column]?.trim();
    if (value) return value;
  }
  return "";
}

function resolveMappedAmountAndCurrency(
  row: Record<string, string>,
  mapping: ColumnMapping,
): { amount: string; currency?: string } | null {
  const accountCurrency = mapping.accountCurrency?.trim().toUpperCase();

  if (
    accountCurrency &&
    mapping.sourceAmountColumn &&
    mapping.sourceCurrencyColumn &&
    mapping.targetAmountColumn &&
    mapping.targetCurrencyColumn
  ) {
    const sourceCurrency = (row[mapping.sourceCurrencyColumn] ?? "")
      .trim()
      .toUpperCase();
    const targetCurrency = (row[mapping.targetCurrencyColumn] ?? "")
      .trim()
      .toUpperCase();

    if (targetCurrency === accountCurrency) {
      const targetAmount = row[mapping.targetAmountColumn];
      if (targetAmount !== undefined && targetAmount !== "") {
        return { amount: targetAmount, currency: targetCurrency || undefined };
      }
    }

    if (sourceCurrency === accountCurrency) {
      const sourceAmount = row[mapping.sourceAmountColumn];
      if (sourceAmount !== undefined && sourceAmount !== "") {
        return { amount: sourceAmount, currency: sourceCurrency || undefined };
      }
    }

    if (targetAmountColumnHasValue(row, mapping.targetAmountColumn)) {
      const targetAmount = row[mapping.targetAmountColumn];
      if (targetAmount !== undefined && targetAmount !== "") {
        return { amount: targetAmount, currency: targetCurrency || undefined };
      }
    }

    if (targetAmountColumnHasValue(row, mapping.sourceAmountColumn)) {
      const sourceAmount = row[mapping.sourceAmountColumn];
      if (sourceAmount !== undefined && sourceAmount !== "") {
        return { amount: sourceAmount, currency: sourceCurrency || undefined };
      }
    }
  }

  if (mapping.amountColumn && row[mapping.amountColumn] !== undefined) {
    return { amount: row[mapping.amountColumn] };
  }

  return null;
}

function targetAmountColumnHasValue(
  row: Record<string, string>,
  column?: string,
): boolean {
  if (!column) return false;
  const value = row[column];
  return value !== undefined && value !== "";
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
