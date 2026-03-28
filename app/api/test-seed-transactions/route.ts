import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { generateFingerprint } from "@/lib/import/fingerprint";
import { normaliseDescription } from "@/lib/import/normaliser";

// Test-only: seed uncategorised transactions (non-production only)
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  let body: { accountName?: string; count?: number; reset?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
  if (!accountName) {
    return NextResponse.json({ error: "accountName required" }, { status: 400 });
  }

  const count = Math.min(50, Math.max(1, Number(body.count) || 3));
  const reset = body.reset !== false;

  const account = db.select().from(accounts).where(eq(accounts.name, accountName)).get();
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (reset) {
    db.delete(transactions).where(eq(transactions.accountId, account.id)).run();
  }

  const inserted: number[] = [];
  const baseDate = "2024-06-01";
  for (let i = 0; i < count; i++) {
    const suffix = crypto.randomUUID();
    const description = `E2E categorise seed ${suffix}`;
    const normalised = normaliseDescription(description);
    const amount = -25.5 - i * 0.01;
    const fingerprint = generateFingerprint(account.id, baseDate, amount, normalised);
    const row = db
      .insert(transactions)
      .values({
        accountId: account.id,
        date: baseDate,
        description,
        normalised,
        fingerprint,
        amount,
        categoryId: null,
        categorySource: null,
        categoryConfirmed: false,
        isManual: false,
      })
      .returning({ id: transactions.id })
      .get();
    inserted.push(row.id);
  }

  revalidatePath("/transactions");
  revalidatePath("/import");

  return NextResponse.json({ ok: true, ids: inserted });
}
