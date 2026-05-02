import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import {
  accounts,
  budgetMonthStatus,
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
  BudgetCategoryKind,
  BudgetCategoryRow,
  BudgetGenerateAnalyticsRow,
  BudgetMonthStatus,
  BudgetRule502030Band,
  BudgetSummary,
  Category,
} from "@/types";
import { generateOccurrences } from "./generate";
import { ruleBucketForSubcategory } from "./rule-bucket";

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

export function getMonthStatus(month: string): BudgetMonthStatus | null {
  const row = db
    .select()
    .from(budgetMonthStatus)
    .where(eq(budgetMonthStatus.month, month))
    .get();
  return (row as BudgetMonthStatus | undefined) ?? null;
}

export function isMonthClosed(month: string): boolean {
  const status = getMonthStatus(month);
  return status?.isClosed ?? false;
}

export function closeMonth(month: string): void {
  db.run(sql`
    INSERT INTO budget_month_status (month, is_closed, closed_at, created_at, updated_at)
    VALUES (${month}, 1, unixepoch(), unixepoch(), unixepoch())
    ON CONFLICT (month)
    DO UPDATE SET is_closed = 1, closed_at = COALESCE(budget_month_status.closed_at, unixepoch()), updated_at = unixepoch()
  `);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Net cash out of category: debits minus credits, clamped at zero. */
export function netOutflowFromSignedSum(signedSumConverted: number): number {
  return Math.max(0, -signedSumConverted);
}

export async function getActualIncomeForMonth(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<number> {
  const { start, end } = getMonthRange(month);
  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        eq(categories.type, "income"),
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

  let sum = 0;
  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    if (conv > 0) sum += conv;
  }
  return roundMoney(sum);
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
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        isNotNull(transactions.categoryId),
        inArray(categories.type, ["expense", "savings"]),
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

  const signed = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      row.amount,
      cur,
      homeCurrency,
      row.date,
    );
    const id = row.categoryId;
    signed.set(id, (signed.get(id) ?? 0) + conv);
  }

  const map = new Map<number, number>();
  for (const [categoryId, sum] of signed) {
    map.set(categoryId, roundMoney(netOutflowFromSignedSum(sum)));
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
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
        isNotNull(transactions.categoryId),
        inArray(categories.type, ["expense", "savings"]),
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

  const byCatMonth = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      row.amount,
      cur,
      homeCurrency,
      row.date,
    );
    const mKey = row.date.slice(0, 7);
    if (!byCatMonth.has(row.categoryId))
      byCatMonth.set(row.categoryId, new Map());
    const mm = byCatMonth.get(row.categoryId)!;
    mm.set(mKey, (mm.get(mKey) ?? 0) + conv);
  }

  const map = new Map<number, number>();
  for (const [categoryId, monthMap] of byCatMonth) {
    let sumMonthlyNet = 0;
    for (const m of months) {
      const signed = monthMap.get(m) ?? 0;
      sumMonthlyNet += netOutflowFromSignedSum(signed);
    }
    map.set(
      categoryId,
      roundMoney(sumMonthlyNet / months.length),
    );
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
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
        isNotNull(transactions.categoryId),
        inArray(categories.type, ["expense", "savings"]),
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

  const byCatMonth = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      row.amount,
      cur,
      homeCurrency,
      row.date,
    );
    const rowMonth = row.date.slice(0, 7);
    if (!byCatMonth.has(row.categoryId))
      byCatMonth.set(row.categoryId, new Map());
    const mm = byCatMonth.get(row.categoryId)!;
    mm.set(rowMonth, (mm.get(rowMonth) ?? 0) + conv);
  }

  const result = new Map<number, { month: string; amount: number }[]>();
  for (const [categoryId, monthMap] of byCatMonth) {
    const entries = months.map((m) => ({
      month: m,
      amount: roundMoney(
        netOutflowFromSignedSum(monthMap.get(m) ?? 0),
      ),
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
  const catType = new Map(allCats.map((c) => [c.id, c.type]));
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
      const t = catType.get(occ.categoryId);
      if (t === "expense" || t === "savings") {
        expenses.set(
          occ.categoryId,
          (expenses.get(occ.categoryId) ?? 0) + Math.abs(conv),
        );
      }
    }
  }

  return { expenses, income: roundMoney(income) };
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

  const mains = allCategories.filter((c) => c.parentId === null);
  const mainGroups = new Map(mains.map((c) => [c.id, c.name]));
  const mainById = new Map(mains.map((c) => [c.id, c]));

  const budgetSubs = allCategories.filter(
    (c) =>
      c.parentId !== null &&
      (c.type === "expense" || c.type === "savings"),
  );

  const kindFor = (t: string): BudgetCategoryKind =>
    t === "savings" ? "savings" : "expense";

  return budgetSubs
    .map((cat) => {
      const parentMain =
        cat.parentId != null ? mainById.get(cat.parentId) : undefined;
      const rb = ruleBucketForSubcategory(parentMain);
      return {
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
        categoryKind: kindFor(cat.type),
        ruleBucket: rb,
      };
    })
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
    (c) =>
      c.parentId !== null &&
      (c.type === "expense" || c.type === "savings"),
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

function emptyBand(): BudgetRule502030Band {
  return { targetTotal: 0, actualTotal: 0, guideline: 0 };
}

export function buildBudgetSummary(
  rows: BudgetCategoryRow[],
  month: string,
  expectedIncome: number,
  incomeBasisFromActual: number,
  monthClosed: boolean,
): BudgetSummary {
  const expenseRows = rows.filter((r) => r.categoryKind === "expense");
  const savingsRows = rows.filter((r) => r.categoryKind === "savings");

  const totalBudgeted = expenseRows.reduce((s, r) => s + r.targetAmount, 0);
  const totalSpent = expenseRows.reduce((s, r) => s + r.actualSpent, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  const totalSavingsBudgeted = savingsRows.reduce(
    (s, r) => s + r.targetAmount,
    0,
  );
  const totalSavingsAllocated = savingsRows.reduce(
    (s, r) => s + r.actualSpent,
    0,
  );

  const incomeBasis = roundMoney(
    Math.max(expectedIncome, incomeBasisFromActual),
  );

  const needs = emptyBand();
  const wants = emptyBand();
  const savingsBand = emptyBand();

  for (const r of rows) {
    const b = r.ruleBucket;
    if (b === "needs") {
      needs.targetTotal += r.targetAmount;
      needs.actualTotal += r.actualSpent;
    } else if (b === "wants") {
      wants.targetTotal += r.targetAmount;
      wants.actualTotal += r.actualSpent;
    } else if (b === "savings") {
      savingsBand.targetTotal += r.targetAmount;
      savingsBand.actualTotal += r.actualSpent;
    }
  }

  needs.guideline = roundMoney(0.5 * incomeBasis);
  wants.guideline = roundMoney(0.3 * incomeBasis);
  savingsBand.guideline = roundMoney(0.2 * incomeBasis);

  needs.targetTotal = roundMoney(needs.targetTotal);
  needs.actualTotal = roundMoney(needs.actualTotal);
  wants.targetTotal = roundMoney(wants.targetTotal);
  wants.actualTotal = roundMoney(wants.actualTotal);
  savingsBand.targetTotal = roundMoney(savingsBand.targetTotal);
  savingsBand.actualTotal = roundMoney(savingsBand.actualTotal);

  let implicitSurplusAsSavings = 0;
  if (monthClosed) {
    const spentR = roundMoney(totalSpent);
    const savedTrackedR = roundMoney(totalSavingsAllocated);
    const surplus = incomeBasis - spentR - savedTrackedR;
    if (surplus > 0.001) {
      implicitSurplusAsSavings = roundMoney(surplus);
      savingsBand.actualTotal = roundMoney(
        savingsBand.actualTotal + implicitSurplusAsSavings,
      );
    }
  }

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
    totalBudgeted: roundMoney(totalBudgeted),
    totalSpent: roundMoney(totalSpent),
    totalRemaining: roundMoney(totalRemaining),
    expectedIncome: roundMoney(expectedIncome),
    totalSavingsBudgeted: roundMoney(totalSavingsBudgeted),
    totalSavingsAllocated: roundMoney(totalSavingsAllocated),
    implicitSurplusAsSavings,
    incomeBasis,
    rule502030: {
      needs,
      wants,
      savings: savingsBand,
    },
    daysInMonth,
    daysElapsed,
    daysRemaining,
    dailyBurnRate: roundMoney(dailyBurnRate),
    allowedDailyRate: roundMoney(allowedDailyRate),
    projectedSpend: roundMoney(projectedSpend),
    onTrack,
  };
}
