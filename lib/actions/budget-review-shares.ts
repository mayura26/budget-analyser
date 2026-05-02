"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { budgetReviewShares } from "@/lib/db/schema";

type ReviewFormat = "digest" | "deep";

export type ReviewShareRow = {
  id: number;
  token: string;
  month: string;
  format: ReviewFormat;
  createdAt: number;
  revokedAt: number | null;
};

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createOrGetReviewShare(
  month: string,
  format: ReviewFormat,
): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }
  if (format !== "digest" && format !== "deep") {
    return { success: false, error: "Invalid format" };
  }

  const existing = db
    .select()
    .from(budgetReviewShares)
    .where(
      and(
        eq(budgetReviewShares.month, month),
        eq(budgetReviewShares.format, format),
        isNull(budgetReviewShares.revokedAt),
      ),
    )
    .get() as ReviewShareRow | undefined;

  if (existing) {
    return { success: true, token: existing.token };
  }

  const token = generateToken();
  db.insert(budgetReviewShares)
    .values({
      token,
      month,
      format,
    })
    .run();

  revalidatePath(`/budget/review`);
  return { success: true, token };
}

export async function revokeReviewShare(
  token: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!token) return { success: false, error: "Missing token" };

  const now = Math.floor(Date.now() / 1000);
  db.update(budgetReviewShares)
    .set({ revokedAt: now })
    .where(eq(budgetReviewShares.token, token))
    .run();

  revalidatePath(`/budget/review`);
  return { success: true };
}

export async function getActiveShare(
  month: string,
  format: ReviewFormat,
): Promise<ReviewShareRow | null> {
  const row = db
    .select()
    .from(budgetReviewShares)
    .where(
      and(
        eq(budgetReviewShares.month, month),
        eq(budgetReviewShares.format, format),
        isNull(budgetReviewShares.revokedAt),
      ),
    )
    .get() as ReviewShareRow | undefined;
  return row ?? null;
}
