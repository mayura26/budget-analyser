"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { transactions, importBatches, bankProfiles } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseCSV, profileToColumnMapping, detectDelimiter, type ColumnMapping } from "@/lib/import/parser";
import { parseCommBankPDF } from "@/lib/import/pdf-parser";
import { normaliseDescription } from "@/lib/import/normaliser";
import { generateFingerprint } from "@/lib/import/fingerprint";
import { categoriseTransactions } from "@/lib/categorisation/engine";
import { detectBankProfile } from "@/lib/import/profiles";
import type { ActionResult, ImportPreview, PreviewRow } from "@/types";

const PreviewSchema = z.object({
  accountId: z.coerce.number(),
  bankProfileId: z.coerce.number(),
  csvContent: z.string().nullish().transform((v) => v ?? ""),
  filename: z.string(),
});

export async function previewImport(formData: FormData): Promise<ActionResult<ImportPreview>> {
  const parsed = PreviewSchema.safeParse({
    accountId: formData.get("accountId"),
    bankProfileId: formData.get("bankProfileId"),
    csvContent: formData.get("csvContent"),
    filename: formData.get("filename"),
  });

  if (!parsed.success) {
    return { success: false, error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
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
    if (!csvContent) return { success: false, error: "No file content provided" };

    // Load bank profile
    const profile = db.select().from(bankProfiles).where(eq(bankProfiles.id, bankProfileId)).get();
    if (!profile) return { success: false, error: "Bank profile not found" };

    const mapping = profileToColumnMapping(profile);
    const csvResult = parseCSV(csvContent, mapping);
    rows = csvResult.rows;
    errors = csvResult.errors;

    // If parsing yields no rows, try to auto-detect a built-in profile from the header.
    if (rows.length === 0) {
      const firstNonEmptyLine =
        csvContent
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)[0] ?? "";

      const delimiter = detectDelimiter(csvContent);
      const headers = firstNonEmptyLine ? firstNonEmptyLine.split(delimiter).map((h) => h.trim()) : [];
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
    return { success: false, error: `No valid rows found. ${errors.join(", ")}` };
  }

  // Generate fingerprints
  const previewRows: PreviewRow[] = rows.map((row) => {
    const normalised = normaliseDescription(row.description);
    const fingerprint = generateFingerprint(accountId, row.date, row.amount, normalised);
    return { ...row, normalised, fingerprint, isDuplicate: false };
  });

  // Check for duplicates in DB
  const fingerprints = previewRows.map((r) => r.fingerprint);
  const existingChunks: string[] = [];

  // SQLite has a limit on IN clause size, batch it
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
      rows: previewRows.slice(0, 100),
      totalRows: previewRows.length,
      newCount: newRows.length,
      duplicateCount: duplicateRows.length,
      dateRangeStart: dates[0] ?? "",
      dateRangeEnd: dates[dates.length - 1] ?? "",
    },
  };
}

export async function confirmImport(
  preview: ImportPreview
): Promise<ActionResult<{ batchId: number; imported: number; skipped: number }>> {
  const newRows = preview.rows.filter((r) => !r.isDuplicate);

  if (newRows.length === 0) {
    return { success: false, error: "No new transactions to import" };
  }

  // Create import batch
  const batch = db.insert(importBatches).values({
    accountId: preview.accountId,
    filename: preview.filename,
    rowCount: preview.totalRows,
    importedCount: newRows.length,
    skippedCount: preview.duplicateCount,
    dateRangeStart: preview.dateRangeStart,
    dateRangeEnd: preview.dateRangeEnd,
    status: "completed",
  }).returning({ id: importBatches.id }).get();

  // Insert all new transactions in a transaction
  const insertedIds: number[] = [];

  db.transaction((tx) => {
    for (const row of newRows) {
      try {
        const result = tx.insert(transactions).values({
          accountId: preview.accountId,
          importBatchId: batch.id,
          fingerprint: row.fingerprint,
          date: row.date,
          description: row.description,
          normalised: row.normalised,
          amount: row.amount,
          tags: "[]",
        }).returning({ id: transactions.id }).get();
        insertedIds.push(result.id);
      } catch {
        // Skip duplicates that slipped through
      }
    }
  });

  // Auto-categorise
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
      skipped: preview.duplicateCount + (newRows.length - insertedIds.length),
    },
  };
}
