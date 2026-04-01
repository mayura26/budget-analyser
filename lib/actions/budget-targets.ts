"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHistoricalAverages } from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

export async function saveBudgetTargets(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const month = formData.get("month") as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }

  const entries: { categoryId: number; amount: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("target_")) continue;
    const categoryId = Number(key.slice(7));
    const amount = Number(value);
    if (Number.isNaN(categoryId) || Number.isNaN(amount)) continue;
    entries.push({ categoryId, amount: Math.max(0, amount) });
  }

  db.transaction((tx) => {
    for (const entry of entries) {
      if (entry.amount > 0) {
        tx.run(sql`
          INSERT INTO budgets (month, category_id, target_amount, created_at, updated_at)
          VALUES (${month}, ${entry.categoryId}, ${entry.amount}, unixepoch(), unixepoch())
          ON CONFLICT (month, category_id)
          DO UPDATE SET target_amount = ${entry.amount}, updated_at = unixepoch()
        `);
      } else {
        tx.delete(budgets)
          .where(
            and(
              eq(budgets.month, month),
              eq(budgets.categoryId, entry.categoryId),
            ),
          )
          .run();
      }
    }
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function copyBudgetForward(
  targetMonth: string,
  sourceMonth: string,
): Promise<ActionResult> {
  if (
    !/^\d{4}-\d{2}$/.test(targetMonth) ||
    !/^\d{4}-\d{2}$/.test(sourceMonth)
  ) {
    return { success: false, error: "Invalid month" };
  }

  const sourceTargets = db
    .select()
    .from(budgets)
    .where(eq(budgets.month, sourceMonth))
    .all();

  if (sourceTargets.length === 0) {
    return {
      success: false,
      error: "No budget targets found for source month",
    };
  }

  db.transaction((tx) => {
    for (const target of sourceTargets) {
      tx.run(sql`
        INSERT INTO budgets (month, category_id, target_amount, created_at, updated_at)
        VALUES (${targetMonth}, ${target.categoryId}, ${target.targetAmount}, unixepoch(), unixepoch())
        ON CONFLICT (month, category_id) DO NOTHING
      `);
    }
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function applyAiSuggestions(
  month: string,
  entries: { categoryId: number; amount: number }[],
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }
  if (entries.length === 0) {
    return { success: false, error: "No suggestions to apply" };
  }

  db.transaction((tx) => {
    for (const { categoryId, amount } of entries) {
      const rounded = Math.ceil(amount / 10) * 10;
      if (rounded > 0) {
        tx.run(sql`
          INSERT INTO budgets (month, category_id, target_amount, created_at, updated_at)
          VALUES (${month}, ${categoryId}, ${rounded}, unixepoch(), unixepoch())
          ON CONFLICT (month, category_id) DO NOTHING
        `);
      }
    }
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function initFromAverages(month: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }

  const averages = await getHistoricalAverages(month, getHomeCurrency());
  if (averages.size === 0) {
    return {
      success: false,
      error: "No historical spending data found to generate suggestions",
    };
  }

  db.transaction((tx) => {
    for (const [categoryId, avg] of averages) {
      const rounded = Math.ceil(avg / 10) * 10; // Round up to nearest $10
      if (rounded > 0) {
        tx.run(sql`
          INSERT INTO budgets (month, category_id, target_amount, created_at, updated_at)
          VALUES (${month}, ${categoryId}, ${rounded}, unixepoch(), unixepoch())
          ON CONFLICT (month, category_id) DO NOTHING
        `);
      }
    }
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
