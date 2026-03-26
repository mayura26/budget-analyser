import type { BankProfile } from "@/types";

export type BankProfileTemplate = Omit<
  BankProfile,
  "id" | "createdAt"
>;

export const BUILT_IN_PROFILES: BankProfileTemplate[] = [
  {
    name: "CommBank",
    dateColumn: "col0",
    descriptionColumn: "col2",
    amountColumn: "col1",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD/MM/YYYY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: JSON.stringify({
      hasHeader: false,
      positionalColumns: {
        date: 0,
        amount: 1,
        description: 2,
      },
    }),
    isSystem: true,
  },
  {
    name: "Monzo",
    dateColumn: "Date",
    descriptionColumn: "Name",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "YYYY-MM-DD",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: null,
    isSystem: true,
  },
  {
    name: "Coles",
    dateColumn: "Date",
    descriptionColumn: "Transaction Details",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD MMM YY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: null,
    isSystem: true,
  },
  {
    name: "Coles",
    dateColumn: "Date",
    descriptionColumn: "Transaction Details",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD MMM YY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: null,
    isSystem: true,
  },
];

// Column aliases used for auto-detection
export const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction date", "trans date", "posted date"],
  description: ["description", "name", "merchant", "payee", "memo", "details", "narrative"],
  amount: ["amount", "value", "transaction amount"],
  debit: ["debit", "withdrawal", "debit amount", "money out"],
  credit: ["credit", "deposit", "credit amount", "money in"],
};

export function detectBankProfile(
  headers: string[]
): BankProfileTemplate | null {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const profile of BUILT_IN_PROFILES) {
    const dateMatch = lowerHeaders.includes(
      profile.dateColumn.toLowerCase()
    );
    const descMatch = lowerHeaders.includes(
      profile.descriptionColumn.toLowerCase()
    );
    if (dateMatch && descMatch) {
      return profile;
    }
  }

  return null;
}

export function parseDateToISO(
  dateStr: string,
  format: string
): string | null {
  try {
    if (format === "DD MMM YY" || format === "DD MMM YYYY") {
      const match = dateStr
        .trim()
        .match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2}|\d{4})$/);
      if (!match) return null;

      const day = parseInt(match[1], 10);
      const monthToken = match[2].toLowerCase().replace(/\./g, "");
      const yearRaw = match[3];

      const monthMap: Record<string, number> = {
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        sept: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12,
      };

      const month = monthMap[monthToken];
      if (!month) return null;

      let year: number;
      if (yearRaw.length === 2) {
        const yy = parseInt(yearRaw, 10);
        // 00–69 -> 2000–2069, 70–99 -> 1970–1999
        year = yy <= 69 ? 2000 + yy : 1900 + yy;
      } else {
        year = parseInt(yearRaw, 10);
      }

      if (isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12) {
        return null;
      }

      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(
        2,
        "0"
      )}`;
    }

    const parts = dateStr.trim().split(/[\/\-\.]/);
    if (parts.length !== 3) return null;

    let year: string, month: string, day: string;

    if (format === "DD/MM/YYYY") {
      [day, month, year] = parts;
    } else if (format === "YYYY-MM-DD") {
      [year, month, day] = parts;
    } else if (format === "MM/DD/YYYY") {
      [month, day, year] = parts;
    } else {
      return null;
    }

    // Validate
    const y = parseInt(year);
    const m = parseInt(month);
    const d = parseInt(day);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;

    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  } catch {
    return null;
  }
}
