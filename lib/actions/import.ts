"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoriseTransactions } from "@/lib/categorisation/engine";
import { db } from "@/lib/db";
import { bankProfiles, importBatches, transactions } from "@/lib/db/schema";
import { generateFingerprint } from "@/lib/import/fingerprint";
import { normaliseDescription } from "@/lib/import/normaliser";
import {
  detectDelimiter,
  parseCSV,
  profileToColumnMapping,
} from "@/lib/import/parser";
import { parseCommBankPDF } from "@/lib/import/pdf-parser";
import { detectBankProfile } from "@/lib/import/profiles";
import type { ActionResult, ImportPreview, PreviewRow } from "@/types";

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
    return { ...row, normalised, fingerprint, isDuplicate: false };
  });

  const fingerprints = previewRows.map((r) => r.fingerprint);
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
    row.isDuplicate = existingSet.has(row.fingerprint);
  }

  const newRows = previewRows.filter((r) => !r.isDuplicate);
  const duplicateRows = previewRows.filter((r) => r.isDuplicate);
  const dates = previewRows.map((r) => r.date).sort();

  return {
    success: true,
    data: {
      accountId,
      filename,
      previewRows,
      newRows,
      duplicateRows,
      dateRangeStart: dates[0] ?? "",
      dateRangeEnd: dates[dates.length - 1] ?? "",
    },
  };
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
      dateRangeStart,
      dateRangeEnd,
    },
  };
}

export async function confirmImport(
  formData: FormData,
): Promise<
  ActionResult<{ batchId: number; imported: number; skipped: number }>
> {
  const built = await buildImportPreview(formData);
  if (!built.success) return built;

  const {
    accountId,
    filename,
    newRows,
    duplicateRows,
    dateRangeStart,
    dateRangeEnd,
    previewRows,
  } = built.data;

  if (newRows.length === 0) {
    return { success: false, error: "No new transactions to import" };
  }

  const batch = db
    .insert(importBatches)
    .values({
      accountId,
      filename,
      rowCount: previewRows.length,
      importedCount: newRows.length,
      skippedCount: duplicateRows.length,
      dateRangeStart,
      dateRangeEnd,
      status: "completed",
    })
    .returning({ id: importBatches.id })
    .get();

  const insertedIds: number[] = [];

  db.transaction((tx) => {
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
  });

  if (insertedIds.length > 0) {
    await categoriseTransactions(insertedIds);
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/import");

  return {
    success: true,
    data: {
      batchId: batch.id,
      imported: insertedIds.length,
      skipped: duplicateRows.length + (newRows.length - insertedIds.length),
    },
  };
}
