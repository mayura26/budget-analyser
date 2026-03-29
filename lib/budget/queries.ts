import { and, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  budgets,
  categories,
  scheduledTransactions,
  transactions,
} from "@/lib/db/schema";
import {
  addCalendarMonths,
  getMonthRange,
  getMonthsEndingAt,
} from "@/lib/utils";
import type { Budget, BudgetCategoryRow, BudgetSummary, Category } from "@/types";
import { generateOccurrences } from "./generate";

export function getBudgetTargetsForMonth(month: string): Budget[] {
  return db
    .select()
    .from(budgets)
    .where(eq(budgets.month, month))
    .all() as Budget[];
}

export function hasBudgetTargets(month: string): boolean {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(budgets)
    .where(eq(budgets.month, month))
    .get();
  return (row?.count ?? 0) > 0;
}

export function getActualSpendingByCategory(
  month: string,
): Map<number, number> {
  const { start, end } = getMonthRange(month);
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`SUM(ABS(${transactions.amount}))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer")),
      ),
    )
    .groupBy(transactions.categoryId)
    .all();

  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId != null) {
      map.set(row.categoryId, row.total);
    }
  }
  return map;
}

export function getHistoricalAverages(
  month: string,
  lookback = 3,
): Map<number, number> {
  const prevMonth = addCalendarMonths(month, -1);
  const months = getMonthsEndingAt(prevMonth, lookback);
  if (months.length === 0) return new Map();

  const firstStart = getMonthRange(months[0]).start;
  const lastEnd = getMonthRange(months[months.length - 1]).end;

  const rows = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`SUM(ABS(${transactions.amount}))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer")),
      ),
    )
    .groupBy(transactions.categoryId)
    .all();

  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId != null) {
      map.set(
        row.categoryId,
        Math.round((row.total / months.length) * 100) / 100,
      );
    }
  }
  return map;
}

export function getScheduledAmountsByCategory(
  month: string,
): { expenses: Map<number, number>; income: number } {
  const { start, end } = getMonthRange(month);

  const allCats = db.select().from(categories).all() as Category[];
  const categoryColorMap = new Map(allCats.map((c) => [c.id, c.color]));

  const rawSchedules = db.select().from(scheduledTransactions).all();
  const schedulesWithColor = rawSchedules.map((s) => ({
    ...s,
    categoryColor: s.categoryId
      ? (categoryColorMap.get(s.categoryId) ?? null)
      : null,
  }));

  const occurrences = generateOccurrences(schedulesWithColor, start, end);

  const expenses = new Map<number, number>();
  let income = 0;

  for (const occ of occurrences) {
    if (occ.amount > 0) {
      income += occ.amount;
    } else if (occ.categoryId != null) {
      expenses.set(
        occ.categoryId,
        (expenses.get(occ.categoryId) ?? 0) + Math.abs(occ.amount),
      );
    }
  }

  return { expenses, income: Math.round(income * 100) / 100 };
}

export function buildBudgetCategoryRows(
  month: string,
  allCategories: Category[],
): BudgetCategoryRow[] {
  const targets = getBudgetTargetsForMonth(month);
  const targetMap = new Map(targets.map((t) => [t.categoryId, t.targetAmount]));

  const actual = getActualSpendingByCategory(month);
  const averages = getHistoricalAverages(month);
  const { expenses: scheduled } = getScheduledAmountsByCategory(month);

  const mainGroups = new Map(
    allCategories
      .filter((c) => c.parentId === null)
      .map((c) => [c.id, c.name]),
  );

  // Only expense sub-categories
  const expenseSubs = allCategories.filter(
    (c) => c.parentId !== null && c.type === "expense",
  );

  return expenseSubs
    .map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      parentName: mainGroups.get(cat.parentId!) ?? "Other",
      color: cat.color,
      targetAmount: targetMap.get(cat.id) ?? 0,
      actualSpent: actual.get(cat.id) ?? 0,
      scheduledAmount: scheduled.get(cat.id) ?? 0,
      avg3Month: averages.get(cat.id) ?? 0,
    }))
    .sort((a, b) => {
      // Sort by parent group, then by name
      const groupCmp = a.parentName.localeCompare(b.parentName);
      if (groupCmp !== 0) return groupCmp;
      return a.categoryName.localeCompare(b.categoryName);
    });
}

export function buildBudgetSummary(
  rows: BudgetCategoryRow[],
  month: string,
  expectedIncome: number,
): BudgetSummary {
  const totalBudgeted = rows.reduce((s, r) => s + r.targetAmount, 0);
  const totalSpent = rows.reduce((s, r) => s + r.actualSpent, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  const { start, end } = getMonthRange(month);
  const daysInMonth =
    Math.round(
      (new Date(`${end}T00:00:00`).getTime() -
        new Date(`${start}T00:00:00`).getTime()) /
        86400000,
    ) + 1;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = start;
  const monthEnd = end;

  let daysElapsed: number;
  if (today < monthStart) {
    daysElapsed = 0;
  } else if (today > monthEnd) {
    daysElapsed = daysInMonth;
  } else {
    daysElapsed =
      Math.round(
        (new Date(`${today}T00:00:00`).getTime() -
          new Date(`${monthStart}T00:00:00`).getTime()) /
          86400000,
      ) + 1;
  }

  const daysRemaining = daysInMonth - daysElapsed;
  const dailyBurnRate = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const allowedDailyRate =
    totalBudgeted > 0 ? totalBudgeted / daysInMonth : 0;
  const projectedSpend =
    daysElapsed > 0 ? dailyBurnRate * daysInMonth : totalSpent;
  const onTrack = totalBudgeted === 0 || projectedSpend <= totalBudgeted;

  return {
    totalBudgeted: Math.round(totalBudgeted * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalRemaining: Math.round(totalRemaining * 100) / 100,
    expectedIncome: Math.round(expectedIncome * 100) / 100,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
    allowedDailyRate: Math.round(allowedDailyRate * 100) / 100,
    projectedSpend: Math.round(projectedSpend * 100) / 100,
    onTrack,
  };
}
