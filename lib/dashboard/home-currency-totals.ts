import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { ruleBucketForSubcategory } from "@/lib/budget/rule-bucket";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { getMonthRange } from "@/lib/utils";
import type {
  BudgetRuleBucket,
  Category,
  CategoryTotal,
  DailyNeedsWants,
  MoneyFlowBreakdown,
  MoneyFlowBreakdownBucket,
  MonthlyTotal,
} from "@/types";

function ruleBucketForCategory(
  categoryId: number | null,
  categoryById: Map<number, Category>,
  mainById: Map<number, Category>,
): BudgetRuleBucket | null {
  if (categoryId == null) return null;
  const category = categoryById.get(categoryId);
  if (!category) return null;

  if (category.parentId !== null) {
    return ruleBucketForSubcategory(mainById.get(category.parentId));
  }

  const raw = category.budgetRuleBucket;
  if (raw === "needs" || raw === "wants" || raw === "savings") return raw;
  if (raw === "none") return null;
  if (category.type === "expense") return "wants";
  if (category.type === "savings") return "savings";
  return null;
}

export async function getMonthlyTotalsInHomeCurrency(
  months: string[],
  homeCurrency: SupportedCurrency,
): Promise<MonthlyTotal[]> {
  const results: MonthlyTotal[] = [];

  for (const month of months) {
    const { start, end } = getMonthRange(month);
    const rows = db
      .select({
        amount: transactions.amount,
        date: transactions.date,
        currency: accounts.currency,
        categoryType: categories.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          gte(transactions.date, start),
          lte(transactions.date, end),
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

    let income = 0;
    let expenses = 0;
    let savings = 0;
    for (const row of rows) {
      const cur = parseAccountCurrency(row.currency, homeCurrency);
      const v = convertToHome(db, row.amount, cur, homeCurrency, row.date);
      const t = row.categoryType;
      if (t === "transfer") continue;
      if (t === "income") {
        income += v;
        continue;
      }
      if (t === "savings") {
        savings += -v;
        continue;
      }
      if (t === "expense") {
        expenses += -v;
        continue;
      }
      if (v > 0) income += v;
      else expenses += -v;
    }

    results.push({
      month,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      net: Math.round((income - expenses - savings) * 100) / 100,
    });
  }

  return results;
}

/** Expense-only slices (outflows) per category (same non-transfer filter). */
export async function getCategoryBreakdownInHomeCurrency(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<{
  expenseTotals: CategoryTotal[];
}> {
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Not processed')`,
      color: sql<string>`COALESCE(${categories.color}, '#9ca3af')`,
      categoryType: categories.type,
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

  const byCat = new Map<
    number | null,
    {
      name: string;
      color: string;
      expenseTotal: number;
      expenseCount: number;
    }
  >();

  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    const key = row.categoryId;
    const existing = byCat.get(key) ?? {
      name: row.categoryName,
      color: row.color,
      expenseTotal: 0,
      expenseCount: 0,
    };
    if (row.categoryType === "expense") {
      existing.expenseTotal += -conv;
      existing.expenseCount += 1;
    } else if (row.categoryType == null && conv < 0) {
      existing.expenseTotal += -conv;
      existing.expenseCount += 1;
    }
    byCat.set(key, existing);
  }

  const expenseTotals: CategoryTotal[] = Array.from(byCat.entries())
    .filter(([, v]) => v.expenseTotal > 0)
    .map(([categoryId, v]) => ({
      categoryId,
      categoryName: v.name,
      color: v.color,
      total: Math.round(v.expenseTotal * 100) / 100,
      count: v.expenseCount,
    }));
  expenseTotals.sort((a, b) => b.total - a.total);

  return { expenseTotals };
}

/** Daily cumulative needs/wants/income for the selected month — dashboard line chart. */
export async function getDailyNeedsWantsForMonth(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<DailyNeedsWants[]> {
  const allCats = db.select().from(categories).all() as Category[];
  const mains = allCats.filter((c) => c.parentId === null);
  const mainById = new Map(mains.map((c) => [c.id, c]));
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const catMeta = new Map<
    number,
    { ruleBucket: string | null; type: string }
  >();
  for (const cat of allCats) {
    const rb = ruleBucketForCategory(cat.id, catById, mainById);
    catMeta.set(cat.id, { ruleBucket: rb, type: cat.type });
  }

  const { start, end } = getMonthRange(month);

  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
      categoryId: transactions.categoryId,
      categoryType: categories.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
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

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const daysInMonth =
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  const dailyDelta = new Map<
    string,
    { income: number; needs: number; wants: number }
  >();
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    dailyDelta.set(iso, { income: 0, needs: 0, wants: 0 });
  }

  for (const row of rows) {
    const bucket = dailyDelta.get(row.date);
    if (!bucket) continue;

    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const v = convertToHome(db, row.amount, cur, homeCurrency, row.date);

    const meta = row.categoryId != null ? catMeta.get(row.categoryId) : null;
    const catType = meta?.type ?? row.categoryType;
    const ruleBucket = meta?.ruleBucket ?? null;

    if (catType === "income" && v > 0) {
      bucket.income += v;
    } else if (catType === "expense") {
      if (ruleBucket === "needs") bucket.needs += Math.max(0, -v);
      else if (ruleBucket === "wants") bucket.wants += Math.max(0, -v);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const result: DailyNeedsWants[] = [];
  let cumIncome = 0;
  let cumNeeds = 0;
  let cumWants = 0;
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const isFuture = iso > today;
    if (!isFuture) {
      const delta = dailyDelta.get(iso) ?? { income: 0, needs: 0, wants: 0 };
      cumIncome += delta.income;
      cumNeeds += delta.needs;
      cumWants += delta.wants;
    }
    result.push({
      date: iso,
      day: d.getDate(),
      income: isFuture ? null : Math.round(cumIncome * 100) / 100,
      needs: isFuture ? null : Math.round(cumNeeds * 100) / 100,
      wants: isFuture ? null : Math.round(cumWants * 100) / 100,
    });
  }
  return result;
}

/**
 * Full-month Needs / Wants net expense totals in home currency (no "today"
 * cutoff, unlike {@link getDailyNeedsWantsForMonth}). Computed the same way as
 * the expense total in {@link getMonthlyTotalsInHomeCurrency}, so refunds inside
 * expense categories reduce the visible cash outflow and the Sankey reconciles
 * with income/net.
 */
export async function getRuleBucketTotalsForMonth(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<{ needs: number; wants: number }> {
  const allCats = db.select().from(categories).all() as Category[];
  const mains = allCats.filter((c) => c.parentId === null);
  const mainById = new Map(mains.map((c) => [c.id, c]));
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const catMeta = new Map<
    number,
    { ruleBucket: string | null; type: string }
  >();
  for (const cat of allCats) {
    const rb = ruleBucketForCategory(cat.id, catById, mainById);
    catMeta.set(cat.id, { ruleBucket: rb, type: cat.type });
  }

  const { start, end } = getMonthRange(month);
  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
      categoryId: transactions.categoryId,
      categoryType: categories.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
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

  let needsSigned = 0;
  let wantsSigned = 0;
  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const v = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    const meta = row.categoryId != null ? catMeta.get(row.categoryId) : null;
    const catType = meta?.type ?? row.categoryType;
    const ruleBucket = meta?.ruleBucket ?? null;
    if (catType !== "expense") continue;
    if (ruleBucket === "needs") needsSigned += v;
    else if (ruleBucket === "wants") wantsSigned += v;
  }

  return {
    needs: Math.round(Math.max(0, -needsSigned) * 100) / 100,
    wants: Math.round(Math.max(0, -wantsSigned) * 100) / 100,
  };
}

function emptyMoneyFlowBreakdown(): MoneyFlowBreakdown {
  return {
    income: [],
    needs: [],
    wants: [],
    other: [],
    savings: [],
  };
}

/** Net category slices for the expandable dashboard money-flow graphic. */
export async function getMoneyFlowBreakdownForMonth(
  month: string,
  homeCurrency: SupportedCurrency,
): Promise<MoneyFlowBreakdown> {
  const allCats = db.select().from(categories).all() as Category[];
  const mainById = new Map(
    allCats.filter((c) => c.parentId === null).map((c) => [c.id, c]),
  );
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const { start, end } = getMonthRange(month);
  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
      categoryId: transactions.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Not processed')`,
      categoryColor: sql<string>`COALESCE(${categories.color}, '#9ca3af')`,
      categoryType: categories.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
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

  const buckets = emptyMoneyFlowBreakdown();
  const byBucketAndCategory = new Map<
    string,
    {
      bucket: MoneyFlowBreakdownBucket;
      key: string;
      label: string;
      color: string;
      signed: number;
      count: number;
    }
  >();

  function addSignedSlice(
    bucket: MoneyFlowBreakdownBucket,
    key: string,
    label: string,
    color: string,
    signed: number,
  ) {
    const mapKey = `${bucket}:${key}`;
    const existing = byBucketAndCategory.get(mapKey) ?? {
      bucket,
      key,
      label,
      color,
      signed: 0,
      count: 0,
    };
    existing.signed += signed;
    existing.count += 1;
    byBucketAndCategory.set(mapKey, existing);
  }

  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const v = convertToHome(db, row.amount, cur, homeCurrency, row.date);
    const ruleBucket = ruleBucketForCategory(row.categoryId, catById, mainById);
    const key =
      row.categoryId == null ? "uncategorised" : `cat-${row.categoryId}`;
    const label = row.categoryName;
    const color = row.categoryColor;

    if (row.categoryType === "income" || (row.categoryType == null && v > 0)) {
      addSignedSlice("income", key, label, color, v);
      continue;
    }

    if (row.categoryType === "savings") {
      addSignedSlice("savings", key, label, color, v);
      continue;
    }

    const isExpense =
      row.categoryType === "expense" || (row.categoryType == null && v < 0);
    if (!isExpense) continue;

    if (ruleBucket === "needs" || ruleBucket === "wants") {
      addSignedSlice(ruleBucket, key, label, color, v);
    } else {
      addSignedSlice("other", key, label, color, v);
    }
  }

  for (const slice of byBucketAndCategory.values()) {
    const rawValue =
      slice.bucket === "income"
        ? Math.max(0, slice.signed)
        : Math.max(0, -slice.signed);
    const value = Math.round(rawValue * 100) / 100;
    if (value <= 0) continue;
    buckets[slice.bucket].push({
      key: slice.key,
      label: slice.label,
      value,
      color: slice.color,
      count: slice.count,
    });
  }

  for (const bucket of Object.keys(buckets) as MoneyFlowBreakdownBucket[]) {
    buckets[bucket].sort((a, b) => b.value - a.value);
  }

  return buckets;
}
