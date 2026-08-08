import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import {
  accounts,
  budgetMonthReviews,
  budgetMonthStatus,
  budgetReviewShares,
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
  BudgetScheduledBreakdown,
  BudgetSummary,
  Category,
} from "@/types";
import { generateOccurrences } from "./generate";
import { computeScheduleAwareProjection } from "./projection";
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

export type SavedMonthReview<TReview, TMetrics> = {
  review: TReview;
  metrics: TMetrics;
  model: string;
  generatedAt: number;
};

export function getMonthReview<TReview, TMetrics>(
  month: string,
  format: "digest" | "deep",
): SavedMonthReview<TReview, TMetrics> | null {
  const row = db
    .select()
    .from(budgetMonthReviews)
    .where(
      and(
        eq(budgetMonthReviews.month, month),
        eq(budgetMonthReviews.format, format),
      ),
    )
    .get() as
    | {
        reviewJson: string;
        metricsJson: string;
        model: string;
        generatedAt: number;
      }
    | undefined;
  if (!row) return null;
  try {
    return {
      review: JSON.parse(row.reviewJson) as TReview,
      metrics: JSON.parse(row.metricsJson) as TMetrics,
      model: row.model,
      generatedAt: row.generatedAt,
    };
  } catch {
    return null;
  }
}

export function saveMonthReview(args: {
  month: string;
  format: "digest" | "deep";
  review: unknown;
  metrics: unknown;
  model: string;
}): number {
  const reviewJson = JSON.stringify(args.review);
  const metricsJson = JSON.stringify(args.metrics);
  db.run(sql`
    INSERT INTO budget_month_reviews (month, format, review_json, metrics_json, model, generated_at)
    VALUES (${args.month}, ${args.format}, ${reviewJson}, ${metricsJson}, ${args.model}, unixepoch())
    ON CONFLICT (month, format)
    DO UPDATE SET
      review_json = excluded.review_json,
      metrics_json = excluded.metrics_json,
      model = excluded.model,
      generated_at = unixepoch()
  `);
  const ts = db
    .select({ generatedAt: budgetMonthReviews.generatedAt })
    .from(budgetMonthReviews)
    .where(
      and(
        eq(budgetMonthReviews.month, args.month),
        eq(budgetMonthReviews.format, args.format),
      ),
    )
    .get();
  return ts?.generatedAt ?? Math.floor(Date.now() / 1000);
}

export function findReviewByShareToken<TReview, TMetrics>(
  token: string,
): {
  month: string;
  format: "digest" | "deep";
  review: TReview;
  metrics: TMetrics;
  model: string;
  generatedAt: number;
} | null {
  if (!token) return null;
  const share = db
    .select()
    .from(budgetReviewShares)
    .where(
      and(
        eq(budgetReviewShares.token, token),
        isNull(budgetReviewShares.revokedAt),
      ),
    )
    .get() as
    | {
        month: string;
        format: "digest" | "deep";
      }
    | undefined;
  if (!share) return null;
  const review = getMonthReview<TReview, TMetrics>(share.month, share.format);
  if (!review) return null;
  return {
    month: share.month,
    format: share.format,
    review: review.review,
    metrics: review.metrics,
    model: review.model,
    generatedAt: review.generatedAt,
  };
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
    const conv = convertToHome(db, row.amount, cur, homeCurrency, row.date);
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
    const conv = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    const mKey = row.date.slice(0, 7);
    let mm = byCatMonth.get(row.categoryId);
    if (!mm) {
      mm = new Map();
      byCatMonth.set(row.categoryId, mm);
    }
    mm.set(mKey, (mm.get(mKey) ?? 0) + conv);
  }

  const map = new Map<number, number>();
  for (const [categoryId, monthMap] of byCatMonth) {
    let sumMonthlyNet = 0;
    for (const m of months) {
      const signed = monthMap.get(m) ?? 0;
      sumMonthlyNet += netOutflowFromSignedSum(signed);
    }
    map.set(categoryId, roundMoney(sumMonthlyNet / months.length));
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
    const conv = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    const rowMonth = row.date.slice(0, 7);
    let mm = byCatMonth.get(row.categoryId);
    if (!mm) {
      mm = new Map();
      byCatMonth.set(row.categoryId, mm);
    }
    mm.set(rowMonth, (mm.get(rowMonth) ?? 0) + conv);
  }

  const result = new Map<number, { month: string; amount: number }[]>();
  for (const [categoryId, monthMap] of byCatMonth) {
    const entries = months.map((m) => ({
      month: m,
      amount: roundMoney(netOutflowFromSignedSum(monthMap.get(m) ?? 0)),
    }));
    result.set(categoryId, entries);
  }
  return result;
}

export async function getScheduledAmountsByCategory(
  month: string,
  homeCurrency: SupportedCurrency,
  options?: { occurringAfter?: string },
): Promise<{
  expenses: Map<number, number>;
  income: number;
  breakdown: Map<number, BudgetScheduledBreakdown[]>;
}> {
  const { start, end } = getMonthRange(month);
  const occurringAfter = options?.occurringAfter;

  const allCats = db.select().from(categories).all() as Category[];
  const catType = new Map(allCats.map((c) => [c.id, c.type]));
  const categoryColorMap = new Map(allCats.map((c) => [c.id, c.color]));

  const rawSchedules = db.select().from(scheduledTransactions).all();
  const scheduleById = new Map(rawSchedules.map((s) => [s.id, s]));
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

  const occurrences = generateOccurrences(
    schedulesWithColor,
    start,
    end,
  ).filter((o) => (occurringAfter ? o.date > occurringAfter : true));

  const keys = occurrences.map((o) => ({
    date: o.date,
    from:
      o.accountId != null
        ? (accountCurrency.get(o.accountId) ?? homeCurrency)
        : homeCurrency,
  }));
  await prefetchRatesToHome(db, keys, homeCurrency);

  const expenses = new Map<number, number>();
  const breakdownDraft = new Map<
    number,
    Map<number, BudgetScheduledBreakdown>
  >();
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
        const amount = Math.abs(conv);
        expenses.set(
          occ.categoryId,
          (expenses.get(occ.categoryId) ?? 0) + amount,
        );

        let categoryBreakdown = breakdownDraft.get(occ.categoryId);
        if (!categoryBreakdown) {
          categoryBreakdown = new Map();
          breakdownDraft.set(occ.categoryId, categoryBreakdown);
        }

        const schedule = scheduleById.get(occ.scheduleId);
        const existing = categoryBreakdown.get(occ.scheduleId);
        if (existing) {
          existing.dates.push(occ.date);
          existing.occurrenceCount += 1;
          existing.amount += amount;
        } else {
          categoryBreakdown.set(occ.scheduleId, {
            scheduleId: occ.scheduleId,
            name: occ.name,
            frequency: schedule?.frequency ?? "monthly",
            dates: [occ.date],
            occurrenceCount: 1,
            amount,
          });
        }
      }
    }
  }

  const breakdown = new Map<number, BudgetScheduledBreakdown[]>();
  for (const [categoryId, bySchedule] of breakdownDraft) {
    breakdown.set(
      categoryId,
      [...bySchedule.values()]
        .map((item) => ({
          ...item,
          dates: [...item.dates].sort(),
          amount: roundMoney(item.amount),
        }))
        .sort((a, b) => {
          const dateCmp = (a.dates[0] ?? "").localeCompare(b.dates[0] ?? "");
          return dateCmp !== 0 ? dateCmp : a.name.localeCompare(b.name);
        }),
    );
  }

  for (const [categoryId, amount] of expenses) {
    expenses.set(categoryId, roundMoney(amount));
  }

  return { expenses, income: roundMoney(income), breakdown };
}
/**
 * Scheduled expense amounts (per category, home currency) for occurrences that have not
 * yet happened — strictly after today. For past/closed months this is empty. Used to make
 * the month-end projection account for lumpy bills (rent, utilities) not yet posted.
 */
export async function getRemainingScheduledByCategory(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<Map<number, number>> {
  const today = new Date().toISOString().slice(0, 10);
  const { expenses } = await getScheduledAmountsByCategory(
    month,
    homeCurrency,
    {
      occurringAfter: today,
    },
  );
  return expenses;
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
  const { expenses: scheduled, breakdown: scheduledBreakdown } =
    await getScheduledAmountsByCategory(month, homeCurrency);

  const mains = allCategories.filter((c) => c.parentId === null);
  const mainGroups = new Map(mains.map((c) => [c.id, c.name]));
  const mainById = new Map(mains.map((c) => [c.id, c]));

  const budgetSubs = allCategories.filter(
    (c) =>
      c.parentId !== null && (c.type === "expense" || c.type === "savings"),
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
        scheduledBreakdown: scheduledBreakdown.get(cat.id) ?? [],
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
      c.parentId !== null && (c.type === "expense" || c.type === "savings"),
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
  scheduledRemainingByCategory: Map<number, number> = new Map(),
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
  const spentR = roundMoney(totalSpent);
  const savedTrackedR = roundMoney(totalSavingsAllocated);
  const actualIncomeR = roundMoney(incomeBasisFromActual);
  const surplus = actualIncomeR - spentR - savedTrackedR;
  if (monthClosed && surplus > 0.001) {
    implicitSurplusAsSavings = roundMoney(surplus);
  }
  savingsBand.actualTotal = roundMoney(
    totalSavingsAllocated + implicitSurplusAsSavings,
  );

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

  // Schedule-aware projection: extrapolate only the discretionary (non-scheduled)
  // run-rate, then add scheduled bills still due this month. This stops lumpy bills
  // (rent, utilities) that have not posted yet from making the month look under budget.
  const scheduledFullMonth = expenseRows.reduce(
    (s, r) => s + r.scheduledAmount,
    0,
  );
  const scheduledRemaining = expenseRows.reduce(
    (s, r) => s + (scheduledRemainingByCategory.get(r.categoryId) ?? 0),
    0,
  );
  const projectedSpend = computeScheduleAwareProjection({
    totalSpent,
    scheduledFullMonth,
    scheduledRemaining,
    daysElapsed,
    daysRemaining,
  });
  const onTrack = totalBudgeted === 0 || projectedSpend <= totalBudgeted;

  return {
    totalBudgeted: roundMoney(totalBudgeted),
    totalSpent: roundMoney(totalSpent),
    totalRemaining: roundMoney(totalRemaining),
    expectedIncome: roundMoney(expectedIncome),
    actualIncome: roundMoney(incomeBasisFromActual),
    monthClosed,
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
    scheduledRemaining: roundMoney(scheduledRemaining),
    onTrack,
  };
}
