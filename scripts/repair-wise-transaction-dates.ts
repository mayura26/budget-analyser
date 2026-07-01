import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { generateFingerprint } from "../lib/import/fingerprint";
import {
  normaliseDescription,
  normaliseDescriptionLegacy,
} from "../lib/import/normaliser";
import { parseCSV, profileToColumnMapping } from "../lib/import/parser";
import { BUILT_IN_PROFILES } from "../lib/import/profiles";
import type { PreviewRow } from "../types";

type WiseAccount = {
  id: number;
  currency: string;
  name: string;
};

type ExistingTransaction = {
  id: number;
  account_id: number;
  fingerprint: string;
  date: string;
  source_timestamp_utc: string | null;
};

export type RepairWiseOptions = {
  csvPath: string;
  databasePath?: string;
  accountId?: number;
  dryRun?: boolean;
};

export type RepairWiseSummary = {
  dryRun: boolean;
  accountsChecked: number;
  csvRowsParsed: number;
  matched: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  skippedAmbiguous: number;
  skippedConflicts: number;
};

function candidateFingerprintsForRow(
  accountId: number,
  row: PreviewRow,
): string[] {
  const dates = new Set([row.date]);
  if (row.legacyDate) dates.add(row.legacyDate);

  const normalisedValues = new Set([row.normalised]);
  const legacyNormalised = normaliseDescriptionLegacy(row.description);
  if (legacyNormalised) normalisedValues.add(legacyNormalised);

  const candidates = new Set<string>();
  for (const date of dates) {
    for (const normalised of normalisedValues) {
      candidates.add(
        generateFingerprint(accountId, date, row.amount, normalised),
      );
    }
  }
  return [...candidates];
}

function parseArgs(argv: string[]): RepairWiseOptions {
  let csvPath = "";
  let databasePath: string | undefined;
  let accountId: number | undefined;
  let dryRun = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--database") {
      databasePath = argv[++i];
    } else if (arg === "--account-id") {
      const parsed = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isNaN(parsed))
        throw new Error("--account-id must be a number");
      accountId = parsed;
    } else if (arg === "--apply") {
      dryRun = false;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (!csvPath) {
      csvPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!csvPath) {
    throw new Error(
      "Usage: npx tsx scripts/repair-wise-transaction-dates.ts <wise.csv> [--database data/budget.db] [--account-id 1] [--apply]",
    );
  }

  return { csvPath, databasePath, accountId, dryRun };
}

function getDatabasePath(databasePath?: string): string {
  return (
    databasePath ??
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "budget.db")
  );
}

function getWiseAccounts(
  db: Database.Database,
  accountId?: number,
): WiseAccount[] {
  const baseSql = `
    SELECT a.id, a.currency, a.name
    FROM accounts a
    JOIN bank_profiles bp ON bp.id = a.bank_profile_id
    WHERE bp.name = 'Wise'
  `;
  if (accountId !== undefined) {
    return db
      .prepare(`${baseSql} AND a.id = ?`)
      .all(accountId) as WiseAccount[];
  }
  return db.prepare(`${baseSql} ORDER BY a.id`).all() as WiseAccount[];
}

function hasSourceTimestampColumn(db: Database.Database): boolean {
  const columns = db.prepare("PRAGMA table_info(transactions)").all() as {
    name: string;
  }[];
  return columns.some((column) => column.name === "source_timestamp_utc");
}

function buildRowsForAccount(
  csvContent: string,
  account: WiseAccount,
): PreviewRow[] {
  const wiseProfile = BUILT_IN_PROFILES.find(
    (profile) => profile.name === "Wise",
  );
  if (!wiseProfile) throw new Error("Built-in Wise profile not found");
  const mapping = profileToColumnMapping({
    ...wiseProfile,
    id: 0,
    createdAt: 0,
  });
  mapping.accountCurrency = account.currency;
  const parsed = parseCSV(csvContent, mapping);
  if (parsed.rows.length === 0) {
    throw new Error(`No valid Wise rows found. ${parsed.errors.join(", ")}`);
  }

  return parsed.rows.map((row) => {
    const normalised = normaliseDescription(row.description);
    return {
      ...row,
      normalised,
      fingerprint: generateFingerprint(
        account.id,
        row.date,
        row.amount,
        normalised,
      ),
      status: "new" as const,
      isDuplicate: false,
    };
  });
}

function findExistingMatches(
  db: Database.Database,
  accountId: number,
  candidates: string[],
): ExistingTransaction[] {
  if (candidates.length === 0) return [];
  const placeholders = candidates.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id, account_id, fingerprint, date, source_timestamp_utc
       FROM transactions
       WHERE account_id = ? AND fingerprint IN (${placeholders})`,
    )
    .all(accountId, ...candidates) as ExistingTransaction[];
}

export function repairWiseTransactionDates(
  options: RepairWiseOptions,
): RepairWiseSummary {
  const dbPath = getDatabasePath(options.databasePath);
  const csvPath = path.resolve(options.csvPath);
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  try {
    if (!hasSourceTimestampColumn(db)) {
      throw new Error(
        "transactions.source_timestamp_utc is missing. Start the app or run migrations before repairing Wise dates.",
      );
    }

    const accounts = getWiseAccounts(db, options.accountId);
    if (options.accountId !== undefined && accounts.length === 0) {
      throw new Error(
        `No Wise account found for account id ${options.accountId}`,
      );
    }

    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const summary: RepairWiseSummary = {
      dryRun: options.dryRun !== false,
      accountsChecked: accounts.length,
      csvRowsParsed: 0,
      matched: 0,
      updated: 0,
      unchanged: 0,
      unmatched: 0,
      skippedAmbiguous: 0,
      skippedConflicts: 0,
    };
    const claimedIds = new Set<number>();

    const update = db.prepare(
      `UPDATE transactions
       SET date = ?, fingerprint = ?, source_timestamp_utc = ?, updated_at = unixepoch()
       WHERE id = ?`,
    );
    const collision = db.prepare(
      `SELECT id FROM transactions
       WHERE account_id = ? AND fingerprint = ? AND id != ?`,
    );

    const runRepair = () => {
      for (const account of accounts) {
        const rows = buildRowsForAccount(csvContent, account);
        summary.csvRowsParsed += rows.length;

        for (const row of rows) {
          const candidates = candidateFingerprintsForRow(account.id, row);
          const matches = findExistingMatches(
            db,
            account.id,
            candidates,
          ).filter((match) => !claimedIds.has(match.id));

          if (matches.length === 0) {
            summary.unmatched++;
            continue;
          }

          const legacyMatches = matches.filter(
            (match) => match.fingerprint !== row.fingerprint,
          );
          const exactMatches = matches.filter(
            (match) => match.fingerprint === row.fingerprint,
          );
          if (legacyMatches.length === 1 && exactMatches.length > 0) {
            summary.skippedConflicts++;
            continue;
          }
          if (matches.length > 1) {
            summary.skippedAmbiguous++;
            continue;
          }

          const existing = matches[0];
          claimedIds.add(existing.id);
          summary.matched++;

          const sourceTimestampUtc = row.sourceTimestampUtc ?? null;
          const needsUpdate =
            existing.date !== row.date ||
            existing.fingerprint !== row.fingerprint ||
            existing.source_timestamp_utc !== sourceTimestampUtc;
          if (!needsUpdate) {
            summary.unchanged++;
            continue;
          }

          const collisionRow = collision.get(
            account.id,
            row.fingerprint,
            existing.id,
          ) as { id: number } | undefined;
          if (collisionRow) {
            summary.skippedConflicts++;
            continue;
          }

          if (!summary.dryRun) {
            update.run(
              row.date,
              row.fingerprint,
              sourceTimestampUtc,
              existing.id,
            );
          }
          summary.updated++;
        }
      }
    };

    if (summary.dryRun) {
      runRepair();
    } else {
      db.transaction(runRepair)();
    }

    return summary;
  } finally {
    db.close();
  }
}

function printSummary(summary: RepairWiseSummary): void {
  console.log(`Mode: ${summary.dryRun ? "dry-run" : "apply"}`);
  console.log(`Accounts checked: ${summary.accountsChecked}`);
  console.log(`CSV rows parsed: ${summary.csvRowsParsed}`);
  console.log(`Matched: ${summary.matched}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Unchanged: ${summary.unchanged}`);
  console.log(`Unmatched: ${summary.unmatched}`);
  console.log(`Skipped ambiguous: ${summary.skippedAmbiguous}`);
  console.log(`Skipped conflicts: ${summary.skippedConflicts}`);
}

async function main(): Promise<void> {
  const summary = repairWiseTransactionDates(parseArgs(process.argv.slice(2)));
  printSummary(summary);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
