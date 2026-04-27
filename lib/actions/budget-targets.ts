"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  buildBudgetGenerateAnalyticsRows,
  closeMonth,
  getHistoricalAverages,
  isMonthClosed,
} from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { budgets, categories, settings } from "@/lib/db/schema";
import { getCurrentMonth } from "@/lib/utils";
import type {
  ActionResult,
  BudgetGenerateAnalyticsRow,
  BudgetGenerateRecommendationRow,
  Category,
} from "@/types";

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

function getTrend(
  row: BudgetGenerateAnalyticsRow,
): BudgetGenerateRecommendationRow["trend"] {
  if (row.lastMonthSpent <= 0 && row.avg3Month <= 0) return "new";
  if (row.lastMonthSpent > row.avg3Month * 1.1) return "up";
  if (row.lastMonthSpent < row.avg3Month * 0.9) return "down";
  return "stable";
}

function buildAiInsight(row: BudgetGenerateAnalyticsRow): string {
  const drivers: string[] = [];
  if (row.expectedSpend > 0) drivers.push("scheduled bills");
  if (row.lastMonthSpent > row.avg3Month * 1.1)
    drivers.push("recent spending increase");
  if (row.currentMonthTarget > 0) drivers.push("existing target");

  if (drivers.length === 0) {
    return "No strong signals yet, so this uses your recent baseline.";
  }
  return `Weighted by ${drivers.join(", ")}.`;
}

function buildRecommendedTarget(row: BudgetGenerateAnalyticsRow): number {
  const baseline = Math.max(
    row.lastMonthSpent,
    row.avg3Month,
    row.expectedSpend,
    row.currentMonthTarget,
  );
  if (baseline <= 0) return 0;
  // Keep a small safety buffer for categories trending up.
  const trendMultiplier = row.lastMonthSpent > row.avg3Month ? 1.05 : 1;
  return Math.ceil((baseline * trendMultiplier) / 10) * 10;
}

export async function generateBudgetRecommendations(
  month: string,
): Promise<
  ActionResult<{
    recommendations: BudgetGenerateRecommendationRow[];
    overallNotes: string;
    aiEnhanced: boolean;
  }>
> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }

  const allCatsRaw = db.select().from(categories).all() as Category[];
  const homeCurrency = getHomeCurrency();
  const analyticsRows = await buildBudgetGenerateAnalyticsRows(
    month,
    allCatsRaw,
    homeCurrency,
  );

  const aiEnabledSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai_enabled"))
    .get();
  const aiEnhanced = aiEnabledSetting?.value === "true";

  const recommendations = analyticsRows
    .map((row) => ({
      ...row,
      recommendedTarget: buildRecommendedTarget(row),
      trend: getTrend(row),
      aiInsight: buildAiInsight(row),
    }))
    .filter(
      (row) =>
        row.recommendedTarget > 0 ||
        row.lastMonthSpent > 0 ||
        row.avg3Month > 0 ||
        row.expectedSpend > 0 ||
        row.currentMonthTarget > 0,
    );

  const overallNotes = aiEnhanced
    ? "AI signals are enabled. Recommendations blend recent spend, trends, and scheduled expenses."
    : "Recommendations use your spending history and scheduled expenses. Enable AI features in Settings for richer insights.";

  return {
    success: true,
    data: { recommendations, overallNotes, aiEnhanced },
  };
}

export async function applyGeneratedBudgetTargets(
  month: string,
  entries: { categoryId: number; amount: number }[],
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }
  if (entries.length === 0) {
    return { success: false, error: "No selected targets to apply" };
  }

  db.transaction((tx) => {
    for (const { categoryId, amount } of entries) {
      const rounded = Math.ceil(Math.max(0, amount) / 10) * 10;
      if (rounded > 0) {
        tx.run(sql`
          INSERT INTO budgets (month, category_id, target_amount, created_at, updated_at)
          VALUES (${month}, ${categoryId}, ${rounded}, unixepoch(), unixepoch())
          ON CONFLICT (month, category_id)
          DO UPDATE SET target_amount = ${rounded}, updated_at = unixepoch()
        `);
      } else {
        tx.delete(budgets)
          .where(
            and(
              eq(budgets.month, month),
              eq(budgets.categoryId, categoryId),
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

export async function closeBudgetMonthAction(month: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "Invalid month" };
  }

  const currentMonth = getCurrentMonth();
  if (month >= currentMonth) {
    return {
      success: false,
      error: "You can only close completed months",
    };
  }

  if (isMonthClosed(month)) {
    return {
      success: false,
      error: "Month is already closed",
    };
  }

  closeMonth(month);
  revalidatePath("/budget");
  revalidatePath(`/budget/review?month=${month}`);
  return { success: true, data: undefined };
}
