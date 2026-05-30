"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoriseTransactions } from "@/lib/categorisation/engine";
import { db } from "@/lib/db";
import {
  accounts,
  bankProfiles,
  importBatches,
  transactions,
} from "@/lib/db/schema";
import { generateFingerprint } from "@/lib/import/fingerprint";
import {
  normaliseDescription,
  normaliseDescriptionLegacy,
  normaliseMerchant,
} from "@/lib/import/normaliser";
import {
  detectDelimiter,
  parseCSV,
  profileToColumnMapping,
} from "@/lib/import/parser";
import { parseCommBankPDF } from "@/lib/import/pdf-parser";
import { detectBankProfile } from "@/lib/import/profiles";
import type { ActionResult, ImportPreview, PreviewRow } from "@/types";

const MERGE_AMOUNT_TOLERANCE = 0.1; // ±10%
const MERGE_DATE_TOLERANCE_DAYS = 3;

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((p) => Number.parseInt(p, 10));
  const [by, bm, bd] = b.split("-").map((p) => Number.parseInt(p, 10));
  const dtA = Date.UTC(ay, am - 1, ad);
  const dtB = Date.UTC(by, bm - 1, bd);
  return Math.round(Math.abs(dtA - dtB) / (24 * 60 * 60 * 1000));
}

function amountWithinTolerance(a: number, b: number): boolean {
  const denom = Math.max(Math.abs(b), 1);
  return Math.abs(a - b) / denom <= MERGE_AMOUNT_TOLERANCE;
}

const PreviewSchema = z.object({
  accountId: z.coerce.number(),
  bankProfileId: z.coerce.number(),
  csvContent: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  filename: z.string(),
});

const PREVIEW_TABLE_ROW_LIMIT = 100;

type BuiltImportPreview = {
  accountId: number;
  filename: string;
  previewRows: PreviewRow[];
  newRows: PreviewRow[];
  duplicateRows: PreviewRow[];
  mergeRows: PreviewRow[];
  dateRangeStart: string;
  dateRangeEnd: string;
};

async function buildImportPreview(
  formData: FormData,
): Promise<ActionResult<BuiltImportPreview>> {
  const parsed = PreviewSchema.safeParse({
    accountId: formData.get("accountId"),
    bankProfileId: formData.get("bankProfileId"),
    csvContent: formData.get("csvContent"),
    filename: formData.get("filename"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { accountId, bankProfileId, csvContent, filename } = parsed.data;
  const account = db
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!account) return { success: false, error: "Account not found" };

  const isPdf = filename.toLowerCase().endsWith(".pdf");
  let rows: Awaited<ReturnType<typeof parseCSV>>["rows"] = [];
  let errors: string[] = [];

  if (isPdf) {
    const pdfFile = formData.get("pdfFile") as File | null;
    if (!pdfFile) return { success: false, error: "No PDF file provided" };
    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const result = await parseCommBankPDF(buffer);
    rows = result.rows;
    errors = result.errors;
  } else {
    if (!csvContent)
      return { success: false, error: "No file content provided" };

    const profile = db
      .select()
      .from(bankProfiles)
      .where(eq(bankProfiles.id, bankProfileId))
      .get();
    if (!profile) return { success: false, error: "Bank profile not found" };

    const mapping = profileToColumnMapping(profile);
    mapping.accountCurrency = account.currency;
    const csvResult = parseCSV(csvContent, mapping);
    rows = csvResult.rows;
    errors = csvResult.errors;

    if (rows.length === 0) {
      const firstNonEmptyLine =
        csvContent
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)[0] ?? "";

      const delimiter = detectDelimiter(csvContent);
      const headers = firstNonEmptyLine
        ? firstNonEmptyLine.split(delimiter).map((h) => h.trim())
        : [];
      const detected = detectBankProfile(headers);
      if (detected) {
        const detectedProfile = db
          .select()
          .from(bankProfiles)
          .where(eq(bankProfiles.name, detected.name))
          .get();
        if (detectedProfile) {
          const retryMapping = profileToColumnMapping(detectedProfile);
          retryMapping.accountCurrency = account.currency;
          const retry = parseCSV(csvContent, retryMapping);
          if (retry.rows.length > 0) {
            rows = retry.rows;
            errors = retry.errors;
          }
        }
      }
    }
  }

  if (rows.length === 0) {
    return {
      success: false,
      error: `No valid rows found. ${errors.join(", ")}`,
    };
  }

  const previewRows: PreviewRow[] = rows.map((row) => {
    const normalised = normaliseDescription(row.description);
    const fingerprint = generateFingerprint(
      accountId,
      row.date,
      row.amount,
      normalised,
    );
    return {
      ...row,
      normalised,
      fingerprint,
      status: "new" as const,
      isDuplicate: false,
    };
  });

  const legacyFingerprintsByPrimary = new Map<string, string>();
  for (const row of previewRows) {
    const legacyNormalised = normaliseDescriptionLegacy(row.description);
    const legacyFingerprint = generateFingerprint(
      accountId,
      row.date,
      row.amount,
      legacyNormalised,
    );
    legacyFingerprintsByPrimary.set(row.fingerprint, legacyFingerprint);
  }

  const fingerprints = Array.from(
    new Set([
      ...previewRows.map((r) => r.fingerprint),
      ...legacyFingerprintsByPrimary.values(),
    ]),
  );
  const existingChunks: string[] = [];
  const chunkSize = 500;
  for (let i = 0; i < fingerprints.length; i += chunkSize) {
    const chunk = fingerprints.slice(i, i + chunkSize);
    const existing = db
      .select({ fingerprint: transactions.fingerprint })
      .from(transactions)
      .where(inArray(transactions.fingerprint, chunk))
      .all();
    existingChunks.push(...existing.map((e) => e.fingerprint));
  }

  const existingSet = new Set(existingChunks);
  for (const row of previewRows) {
    const legacyFingerprint = legacyFingerprintsByPrimary.get(row.fingerprint);
    if (
      existingSet.has(row.fingerprint) ||
      (legacyFingerprint !== undefined && existingSet.has(legacyFingerprint))
    ) {
      row.status = "duplicate";
      row.isDuplicate = true;
    }
  }

  // Resolve pending -> settled merges. Settled rows that don't already match
  // exactly may "promote" an existing pending transaction (or an in-batch
  // pending row) instead of being inserted as a duplicate.
  resolvePendingMerges(accountId, previewRows);

  const newRows = previewRows.filter((r) => r.status === "new");
  const duplicateRows = previewRows.filter((r) => r.status === "duplicate");
  const mergeRows = previewRows.filter((r) => r.status === "merge");
  const dates = previewRows.map((r) => r.date).sort();

  return {
    success: true,
    data: {
      accountId,
      filename,
      previewRows,
      newRows,
      duplicateRows,
      mergeRows,
      dateRangeStart: dates[0] ?? "",
      dateRangeEnd: dates[dates.length - 1] ?? "",
    },
  };
}

type PendingCandidate = {
  id: number;
  date: string;
  amount: number;
  normalised: string;
  merchant: string | null;
  accountReference: string | null;
};

function findBestMatch(
  candidates: PendingCandidate[],
  row: PreviewRow,
  rowMerchantNorm: string,
): PendingCandidate | null {
  let best: PendingCandidate | null = null;
  let bestAmountDelta = Number.POSITIVE_INFINITY;
  let bestDateDelta = Number.POSITIVE_INFINITY;

  for (const cand of candidates) {
    const candMerchantNorm = normaliseMerchant(cand.merchant);
    if (rowMerchantNorm) {
      // Both merchant strings present: require normalised match.
      if (candMerchantNorm && candMerchantNorm !== rowMerchantNorm) continue;
      // Fall back to normalised description prefix-match if candidate
      // has no merchant but the row does.
      if (
        !candMerchantNorm &&
        !cand.normalised.toLowerCase().includes(rowMerchantNorm)
      ) {
        continue;
      }
    } else if (candMerchantNorm) {
      // Row has no merchant but candidate does: require candidate's
      // merchant to appear in the row's normalised description.
      if (!row.normalised.toLowerCase().includes(candMerchantNorm)) continue;
    } else {
      // Neither side has a merchant string — fall back to comparing
      // normalised descriptions.
      if (cand.normalised !== row.normalised) continue;
    }

    if (
      row.accountReference &&
      cand.accountReference &&
      row.accountReference !== cand.accountReference
    ) {
      continue;
    }

    if (!amountWithinTolerance(row.amount, cand.amount)) continue;
    if (daysBetween(row.date, cand.date) > MERGE_DATE_TOLERANCE_DAYS) continue;

    const amountDelta = Math.abs(row.amount - cand.amount);
    const dateDelta = daysBetween(row.date, cand.date);
    if (
      amountDelta < bestAmountDelta ||
      (amountDelta === bestAmountDelta && dateDelta < bestDateDelta)
    ) {
      best = cand;
      bestAmountDelta = amountDelta;
      bestDateDelta = dateDelta;
    }
  }

  return best;
}

function resolvePendingMerges(
  accountId: number,
  previewRows: PreviewRow[],
): void {
  const candidateSettledRows = previewRows.filter(
    (r) => r.status === "new" && r.pending !== true,
  );
  const candidatePendingRows = previewRows.filter(
    (r) => r.status === "new" && r.pending === true,
  );

  if (candidateSettledRows.length === 0) return;

  const minDate = candidateSettledRows
    .map((r) => shiftDate(r.date, -MERGE_DATE_TOLERANCE_DAYS))
    .sort()[0];
  const maxDate = candidateSettledRows
    .map((r) => shiftDate(r.date, MERGE_DATE_TOLERANCE_DAYS))
    .sort()
    .reverse()[0];

  const dbCandidates: PendingCandidate[] = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      normalised: transactions.normalised,
      merchant: transactions.merchant,
      accountReference: transactions.accountReference,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.pending, true),
        gte(transactions.date, minDate),
        lte(transactions.date, maxDate),
      ),
    )
    .all();

  const claimedDbIds = new Set<number>();
  const claimedBatchFingerprints = new Set<string>();

  for (const row of candidateSettledRows) {
    const rowMerchantNorm = normaliseMerchant(row.merchant);

    const dbPool = dbCandidates.filter((c) => !claimedDbIds.has(c.id));
    const dbMatch = findBestMatch(dbPool, row, rowMerchantNorm);
    if (dbMatch) {
      row.status = "merge";
      row.mergeTargetId = dbMatch.id;
      claimedDbIds.add(dbMatch.id);
      continue;
    }

    // Within-batch match: settled row replaces an earlier pending row in the
    // same import. The pending row is dropped from the new bucket and the
    // settled row is inserted in its place (as non-pending).
    const hasOpenBatchPending = candidatePendingRows.some(
      (p) => p.status === "new" && !claimedBatchFingerprints.has(p.fingerprint),
    );
    if (!hasOpenBatchPending) continue;

    let bestPendingIdx: number | null = null;
    let bestAmountDelta = Number.POSITIVE_INFINITY;
    for (let idx = 0; idx < candidatePendingRows.length; idx++) {
      const p = candidatePendingRows[idx];
      if (p.status !== "new") continue;
      if (claimedBatchFingerprints.has(p.fingerprint)) continue;
      const cand: PendingCandidate = {
        id: 0,
        date: p.date,
        amount: p.amount,
        normalised: p.normalised,
        merchant: p.merchant ?? null,
        accountReference: p.accountReference ?? null,
      };
      const matched = findBestMatch([cand], row, rowMerchantNorm);
      if (matched) {
        const delta = Math.abs(row.amount - p.amount);
        if (delta < bestAmountDelta) {
          bestPendingIdx = idx;
          bestAmountDelta = delta;
        }
      }
    }

    if (bestPendingIdx !== null) {
      const pendingRow = candidatePendingRows[bestPendingIdx];
      claimedBatchFingerprints.add(pendingRow.fingerprint);
      // Drop the pending row from the batch by marking it as a duplicate of
      // the settled row that's about to be inserted in its place.
      pendingRow.status = "duplicate";
      pendingRow.isDuplicate = true;
      // Settled row stays as "new" but we ensure pending=false.
      row.pending = false;
    }
  }
}

export async function previewImport(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  const built = await buildImportPreview(formData);
  if (!built.success) return built;

  const {
    accountId,
    filename,
    previewRows,
    newRows,
    duplicateRows,
    mergeRows,
    dateRangeStart,
    dateRangeEnd,
  } = built.data;

  return {
    success: true,
    data: {
      accountId,
      filename,
      rows: previewRows.slice(0, PREVIEW_TABLE_ROW_LIMIT),
      totalRows: previewRows.length,
      newCount: newRows.length,
      duplicateCount: duplicateRows.length,
      mergeCount: mergeRows.length,
      dateRangeStart,
      dateRangeEnd,
    },
  };
}

export async function confirmImport(formData: FormData): Promise<
  ActionResult<{
    batchId: number;
    imported: number;
    overwritten: number;
    merged: number;
    skipped: number;
  }>
> {
  const built = await buildImportPreview(formData);
  if (!built.success) return built;
  const overwriteDuplicates = formData.get("overwriteDuplicates") === "1";

  const {
    accountId,
    filename,
    newRows,
    duplicateRows,
    mergeRows,
    dateRangeStart,
    dateRangeEnd,
    previewRows,
  } = built.data;
  const account = db
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!account) return { success: false, error: "Account not found" };

  if (
    newRows.length === 0 &&
    mergeRows.length === 0 &&
    (!overwriteDuplicates || duplicateRows.length === 0)
  ) {
    return { success: false, error: "No transactions to import" };
  }

  const batch = db
    .insert(importBatches)
    .values({
      accountId,
      filename,
      rowCount: previewRows.length,
      importedCount: newRows.length,
      skippedCount: overwriteDuplicates ? 0 : duplicateRows.length,
      dateRangeStart,
      dateRangeEnd,
      status: "completed",
    })
    .returning({ id: importBatches.id })
    .get();

  const insertedIds: number[] = [];
  const mergedIds: number[] = [];
  let overwritten = 0;

  db.transaction((tx) => {
    const now = Math.floor(Date.now() / 1000);

    // Merge first: promote pending DB rows to settled (in place) so the
    // unique fingerprint constraint can't collide with a fresh insert below.
    for (const row of mergeRows) {
      if (!row.mergeTargetId) continue;
      try {
        const result = tx
          .update(transactions)
          .set({
            importBatchId: batch.id,
            fingerprint: row.fingerprint,
            date: row.date,
            description: row.description,
            normalised: row.normalised,
            amount: row.amount,
            originalAmount: row.amount,
            originalCurrency: row.currency ?? account.currency,
            merchant: row.merchant ?? null,
            accountReference: row.accountReference ?? null,
            pending: false,
            updatedAt: now,
          })
          .where(eq(transactions.id, row.mergeTargetId))
          .returning({ id: transactions.id })
          .all();
        if (result.length > 0) {
          mergedIds.push(result[0].id);
        }
      } catch {
        // Defensive: if the new fingerprint somehow collides with another
        // existing row, fall back to the duplicate-overwrite path against
        // that fingerprint and leave the original pending row alone.
        const fallback = tx
          .update(transactions)
          .set({
            importBatchId: batch.id,
            description: row.description,
            normalised: row.normalised,
            amount: row.amount,
            originalAmount: row.amount,
            originalCurrency: row.currency ?? account.currency,
            merchant: row.merchant ?? null,
            accountReference: row.accountReference ?? null,
            pending: false,
            updatedAt: now,
          })
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.fingerprint, row.fingerprint),
            ),
          )
          .returning({ id: transactions.id })
          .all();
        if (fallback.length > 0) {
          mergedIds.push(fallback[0].id);
        }
      }
    }

    for (const row of newRows) {
      try {
        const result = tx
          .insert(transactions)
          .values({
            accountId,
            importBatchId: batch.id,
            fingerprint: row.fingerprint,
            date: row.date,
            description: row.description,
            normalised: row.normalised,
            amount: row.amount,
            originalAmount: row.amount,
            originalCurrency: row.currency ?? account.currency,
            merchant: row.merchant ?? null,
            accountReference: row.accountReference ?? null,
            pending: row.pending === true,
            tags: "[]",
            categoryConfirmed: false,
          })
          .returning({ id: transactions.id })
          .get();
        insertedIds.push(result.id);
      } catch {
        // Skip duplicates that slipped through
      }
    }

    if (overwriteDuplicates) {
      for (const row of duplicateRows) {
        const result = tx
          .update(transactions)
          .set({
            importBatchId: batch.id,
            description: row.description,
            normalised: row.normalised,
            amount: row.amount,
            originalAmount: row.amount,
            originalCurrency: row.currency ?? account.currency,
            merchant: row.merchant ?? null,
            accountReference: row.accountReference ?? null,
            updatedAt: now,
          })
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.fingerprint, row.fingerprint),
            ),
          )
          .returning({ id: transactions.id })
          .all();
        overwritten += result.length;
      }
    }
  });

  const categoriseIds = [...insertedIds, ...mergedIds];
  if (categoriseIds.length > 0) {
    await categoriseTransactions(categoriseIds);
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/import");
  revalidatePath("/accounts");

  return {
    success: true,
    data: {
      batchId: batch.id,
      imported: insertedIds.length,
      overwritten,
      merged: mergedIds.length,
      skipped:
        (overwriteDuplicates ? 0 : duplicateRows.length) +
        (newRows.length - insertedIds.length),
    },
  };
}
