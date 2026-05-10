import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { ruleBucketForSubcategory } from "@/lib/budget/rule-bucket";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { getMonthRange } from "@/lib/utils";
import type {
  Category,
  CategoryTotal,
  MonthlyNeedsWants,
  MonthlyTotal,
} from "@/types";

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

/** Monthly needs/wants/income breakdown, used for the dashboard line chart. */
export async function getMonthlyNeedsWantsInHomeCurrency(
  months: string[],
  homeCurrency: SupportedCurrency,
): Promise<MonthlyNeedsWants[]> {
  if (months.length === 0) return [];

  const allCats = db.select().from(categories).all() as Category[];
  const mains = allCats.filter((c) => c.parentId === null);
  const mainById = new Map(mains.map((c) => [c.id, c]));

  // Map: categoryId → ruleBucket ("needs" | "wants" | null) and type
  const catMeta = new Map<
    number,
    { ruleBucket: string | null; type: string }
  >();
  for (const cat of allCats) {
    const parentMain =
      cat.parentId != null ? mainById.get(cat.parentId) : undefined;
    const rb =
      cat.parentId === null ? null : ruleBucketForSubcategory(parentMain);
    catMeta.set(cat.id, { ruleBucket: rb, type: cat.type });
  }

  const firstStart = getMonthRange(months[0]).start;
  const lastEnd = getMonthRange(months[months.length - 1]).end;

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
        gte(transactions.date, firstStart),
        lte(transactions.date, lastEnd),
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

  const byMonth = new Map<
    string,
    { income: number; needs: number; wants: number }
  >();
  for (const m of months) {
    byMonth.set(m, { income: 0, needs: 0, wants: 0 });
  }

  for (const row of rows) {
    const mKey = row.date.slice(0, 7);
    const bucket = byMonth.get(mKey);
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

  return months.map((m) => {
    const b = byMonth.get(m) ?? { income: 0, needs: 0, wants: 0 };
    return {
      month: m,
      income: Math.round(b.income * 100) / 100,
      needs: Math.round(b.needs * 100) / 100,
      wants: Math.round(b.wants * 100) / 100,
    };
  });
}
