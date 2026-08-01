import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { generateFingerprint } from "@/lib/import/fingerprint";
import { normaliseDescription } from "@/lib/import/normaliser";

// Test-only: seed uncategorised transactions (non-production only)
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  let body: {
    accountName?: string;
    count?: number;
    reset?: boolean;
    /** Categorised but not verified — for bulk AI “all unconfirmed” E2E. */
    variant?: "uncategorised" | "needs_review";
    /** YYYY-MM — transaction dates use the first day of this month (default 2024-06-01). */
    seedMonth?: string;
    /** Insert one large income row so monthly net is positive (E2E dashboard pie). */
    addIncome?: boolean;
    /** Exact category name to assign to seeded debit rows. */
    categoryName?: string;
    /** Repeated merchant name to store on seeded debit rows. */
    merchant?: string;
    /** Base description prefix for seeded debit rows. */
    description?: string;
    /** Exact amount for each seeded debit row. */
    amount?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountName =
    typeof body.accountName === "string" ? body.accountName.trim() : "";
  if (!accountName) {
    return NextResponse.json(
      { error: "accountName required" },
      { status: 400 },
    );
  }

  const count = Math.min(50, Math.max(1, Number(body.count) || 3));
  const reset = body.reset !== false;
  const variant = body.variant ?? "uncategorised";

  const categoryName =
    typeof body.categoryName === "string" ? body.categoryName.trim() : "";
  const seededCategory = categoryName
    ? db
        .select()
        .from(categories)
        .where(eq(categories.name, categoryName))
        .get()
    : null;
  if (categoryName && !seededCategory) {
    return NextResponse.json(
      { error: `Category not found: ${categoryName}` },
      { status: 400 },
    );
  }

  const merchant =
    typeof body.merchant === "string" && body.merchant.trim()
      ? body.merchant.trim()
      : null;
  const descriptionPrefix =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : "E2E categorise seed";
  const fixedAmount = Number.isFinite(body.amount) ? Number(body.amount) : null;

  let reviewCategoryId: number | null = null;
  if (variant === "needs_review") {
    // Prefer Health so E2E can switch to Groceries and assert category-change highlight.
    const health = db
      .select()
      .from(categories)
      .where(eq(categories.name, "Health (medical, pharmacy, gym)"))
      .get();
    const cat = health ?? db.select().from(categories).limit(1).get();
    if (!cat) {
      return NextResponse.json(
        { error: "No categories — seed defaults first" },
        { status: 400 },
      );
    }
    reviewCategoryId = cat.id;
  }

  const account = db
    .select()
    .from(accounts)
    .where(eq(accounts.name, accountName))
    .get();
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (reset) {
    db.delete(transactions).where(eq(transactions.accountId, account.id)).run();
  }

  const inserted: number[] = [];
  const seedMonth =
    typeof body.seedMonth === "string" && /^\d{4}-\d{2}$/.test(body.seedMonth)
      ? body.seedMonth
      : null;
  const baseDate = seedMonth ? `${seedMonth}-01` : "2024-06-01";
  for (let i = 0; i < count; i++) {
    const suffix = crypto.randomUUID();
    const description = `${descriptionPrefix} ${suffix}`;
    const normalised = normaliseDescription(description);
    const amount = fixedAmount ?? -25.5 - i * 0.01;
    const fingerprint = generateFingerprint(
      account.id,
      baseDate,
      amount,
      normalised,
    );
    const row = db
      .insert(transactions)
      .values({
        accountId: account.id,
        date: baseDate,
        description,
        normalised,
        fingerprint,
        amount,
        categoryId:
          seededCategory?.id ??
          (variant === "needs_review" ? reviewCategoryId : null),
        categorySource: seededCategory
          ? "manual"
          : variant === "needs_review"
            ? "rule"
            : null,
        categoryConfirmed: Boolean(seededCategory),
        merchant,
        isManual: false,
      })
      .returning({ id: transactions.id })
      .get();
    inserted.push(row.id);
  }

  if (body.addIncome === true) {
    const suffix = crypto.randomUUID();
    const description = `E2E income seed ${suffix}`;
    const normalised = normaliseDescription(description);
    const amount = 10_000;
    const fingerprint = generateFingerprint(
      account.id,
      baseDate,
      amount,
      normalised,
    );
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
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/budget");

  return NextResponse.json({ ok: true, ids: inserted });
}
