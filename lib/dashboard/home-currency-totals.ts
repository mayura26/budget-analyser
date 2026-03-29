import { and, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { getMonthRange } from "@/lib/utils";
import type { CategoryTotal, MonthlyTotal } from "@/types";

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
    for (const row of rows) {
      const cur = parseAccountCurrency(row.currency, homeCurrency);
      const v = convertToHome(db, row.amount, cur, homeCurrency, row.date);
      if (v > 0) income += v;
      else expenses += Math.abs(v);
    }

    results.push({
      month,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
    });
  }

  return results;
}

export async function getCategoryTotalsInHomeCurrency(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<CategoryTotal[]> {
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Not processed')`,
      color: sql<string>`COALESCE(${categories.color}, '#9ca3af')`,
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

  const byCat = new Map<
    number | null,
    { name: string; color: string; total: number; count: number }
  >();

  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    const conv = convertToHome(
      db,
      Math.abs(row.amount),
      cur,
      homeCurrency,
      row.date,
    );
    const key = row.categoryId;
    const existing = byCat.get(key) ?? {
      name: row.categoryName,
      color: row.color,
      total: 0,
      count: 0,
    };
    existing.total += conv;
    existing.count += 1;
    byCat.set(key, existing);
  }

  const out: CategoryTotal[] = Array.from(byCat.entries()).map(
    ([categoryId, v]) => ({
      categoryId,
      categoryName: v.name,
      color: v.color,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
    }),
  );

  out.sort((a, b) => b.total - a.total);
  return out;
}
