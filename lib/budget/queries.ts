import { and, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import {
  accounts,
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
import type {
  Budget,
  BudgetCategoryRow,
  BudgetGenerateAnalyticsRow,
  BudgetSummary,
  Category,
} from "@/types";
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

export async function getActualSpendingByCategory(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<Map<number, number>> {
  const { start, end } = getMonthRange(month);
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer")),
      ),
    )
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.currency, homeCurrency),
    })),
    homeCurrency,
  );

  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      Math.abs(row.amount),
      cur,
      homeCurrency,
      row.date,
    );
    map.set(row.categoryId, (map.get(row.categoryId) ?? 0) + conv);
  }
  return map;
}

export async function getHistoricalAverages(
  month: string,
  homeCurrency: SupportedCurrency,
  lookback = 3,
): Promise<Map<number, number>> {
  const prevMonth = addCalendarMonths(month, -1);
  const months = getMonthsEndingAt(prevMonth, lookback);
  if (months.length === 0) return new Map();

  const firstStart = getMonthRange(months[0]).start;
  const lastEnd = getMonthRange(months[months.length - 1]).end;

  const rows = db
    .select({
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer")),
      ),
    )
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.currency, homeCurrency),
    })),
    homeCurrency,
  );

  const totals = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      Math.abs(row.amount),
      cur,
      homeCurrency,
      row.date,
    );
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + conv);
  }

  const map = new Map<number, number>();
  for (const [categoryId, total] of totals) {
    map.set(categoryId, Math.round((total / months.length) * 100) / 100);
  }
  return map;
}

export async function getMonthlySpendingByCategory(
  month: string,
  homeCurrency: SupportedCurrency,
  lookback = 6,
): Promise<Map<number, { month: string; amount: number }[]>> {
  const prevMonth = addCalendarMonths(month, -1);
  const months = getMonthsEndingAt(prevMonth, lookback);
  if (months.length === 0) return new Map();

  const firstStart = getMonthRange(months[0]).start;
  const lastEnd = getMonthRange(months[months.length - 1]).end;

  const rows = db
    .select({
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer")),
      ),
    )
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.currency, homeCurrency),
    })),
    homeCurrency,
  );

  const map = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      Math.abs(row.amount),
      cur,
      homeCurrency,
      row.date,
    );
    const rowMonth = row.date.slice(0, 7);
    if (!map.has(row.categoryId)) map.set(row.categoryId, new Map());
    const catMap = map.get(row.categoryId)!;
    catMap.set(rowMonth, (catMap.get(rowMonth) ?? 0) + conv);
  }

  const result = new Map<number, { month: string; amount: number }[]>();
  for (const [categoryId, monthMap] of map) {
    const entries = months.map((m) => ({
      month: m,
      amount: Math.round((monthMap.get(m) ?? 0) * 100) / 100,
    }));
    result.set(categoryId, entries);
  }
  return result;
}

export async function getScheduledAmountsByCategory(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<{ expenses: Map<number, number>; income: number }> {
  const { start, end } = getMonthRange(month);

  const allCats = db.select().from(categories).all() as Category[];
  const categoryColorMap = new Map(allCats.map((c) => [c.id, c.color]));

  const rawSchedules = db.select().from(scheduledTransactions).all();
  const accountRows = db.select().from(accounts).all();
  const accountCurrency = new Map(
    accountRows.map((a) => [
      a.id,
      parseAccountCurrency(a.currency, homeCurrency),
    ]),
  );

  const schedulesWithColor = rawSchedules.map((s) => ({
    ...s,
    categoryColor: s.categoryId
      ? (categoryColorMap.get(s.categoryId) ?? null)
      : null,
  }));

  const occurrences = generateOccurrences(schedulesWithColor, start, end);

  const keys = occurrences.map((o) => ({
    date: o.date,
    from:
      o.accountId != null
        ? (accountCurrency.get(o.accountId) ?? homeCurrency)
        : homeCurrency,
  }));
  await prefetchRatesToHome(db, keys, homeCurrency);

  const expenses = new Map<number, number>();
  let income = 0;

  for (const occ of occurrences) {
    const cur =
      occ.accountId != null
        ? (accountCurrency.get(occ.accountId) ?? homeCurrency)
        : homeCurrency;
    const conv = convertToHome(db, occ.amount, cur, homeCurrency, occ.date);
    if (conv > 0) {
      income += conv;
    } else if (occ.categoryId != null) {
      expenses.set(
        occ.categoryId,
        (expenses.get(occ.categoryId) ?? 0) + Math.abs(conv),
      );
    }
  }

  return { expenses, income: Math.round(income * 100) / 100 };
}

export async function buildBudgetCategoryRows(
  month: string,
  allCategories: Category[],
  homeCurrency: SupportedCurrency,
): Promise<BudgetCategoryRow[]> {
  const targets = getBudgetTargetsForMonth(month);
  const targetMap = new Map(targets.map((t) => [t.categoryId, t.targetAmount]));

  const actual = await getActualSpendingByCategory(month, homeCurrency);
  const averages = await getHistoricalAverages(month, homeCurrency);
  const { expenses: scheduled } = await getScheduledAmountsByCategory(
    month,
    homeCurrency,
  );

  const mainGroups = new Map(
    allCategories.filter((c) => c.parentId === null).map((c) => [c.id, c.name]),
  );

  const expenseSubs = allCategories.filter(
    (c) => c.parentId !== null && c.type === "expense",
  );

  return expenseSubs
    .map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      parentName:
        cat.parentId != null
          ? (mainGroups.get(cat.parentId) ?? "Other")
          : "Other",
      color: cat.color,
      targetAmount: targetMap.get(cat.id) ?? 0,
      actualSpent: actual.get(cat.id) ?? 0,
      scheduledAmount: scheduled.get(cat.id) ?? 0,
      avg3Month: averages.get(cat.id) ?? 0,
    }))
    .sort((a, b) => {
      const groupCmp = a.parentName.localeCompare(b.parentName);
      if (groupCmp !== 0) return groupCmp;
      return a.categoryName.localeCompare(b.categoryName);
    });
}

export async function buildBudgetGenerateAnalyticsRows(
  month: string,
  allCategories: Category[],
  homeCurrency: SupportedCurrency,
): Promise<BudgetGenerateAnalyticsRow[]> {
  const currentTargets = getBudgetTargetsForMonth(month);
  const currentTargetMap = new Map(
    currentTargets.map((target) => [target.categoryId, target.targetAmount]),
  );
  const previousMonth = addCalendarMonths(month, -1);
  const lastTargets = getBudgetTargetsForMonth(previousMonth);
  const lastTargetMap = new Map(
    lastTargets.map((target) => [target.categoryId, target.targetAmount]),
  );
  const lastMonthSpent = await getActualSpendingByCategory(
    previousMonth,
    homeCurrency,
  );
  const averages = await getHistoricalAverages(month, homeCurrency);
  const { expenses: scheduled } = await getScheduledAmountsByCategory(
    month,
    homeCurrency,
  );

  const mainGroups = new Map(
    allCategories.filter((c) => c.parentId === null).map((c) => [c.id, c.name]),
  );

  const expenseSubs = allCategories.filter(
    (c) => c.parentId !== null && c.type === "expense",
  );

  return expenseSubs
    .map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      parentName:
        cat.parentId != null
          ? (mainGroups.get(cat.parentId) ?? "Other")
          : "Other",
      color: cat.color,
      currentMonthTarget: currentTargetMap.get(cat.id) ?? 0,
      lastMonthTarget: lastTargetMap.get(cat.id) ?? 0,
      lastMonthSpent: lastMonthSpent.get(cat.id) ?? 0,
      avg3Month: averages.get(cat.id) ?? 0,
      expectedSpend: scheduled.get(cat.id) ?? 0,
    }))
    .sort((a, b) => {
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
  const allowedDailyRate = totalBudgeted > 0 ? totalBudgeted / daysInMonth : 0;
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
