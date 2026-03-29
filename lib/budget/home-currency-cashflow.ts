import { eq } from "drizzle-orm";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import type { Occurrence } from "@/types";

export async function getTotalBalanceInHomeCurrency(
  homeCurrency: SupportedCurrency,
): Promise<number> {
  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.currency, homeCurrency),
    })),
    homeCurrency,
  );

  let total = 0;
  for (const row of rows) {
    const cur = parseAccountCurrency(row.currency, homeCurrency);
    total += convertToHome(db, row.amount, cur, homeCurrency, row.date);
  }
  return Math.round(total * 100) / 100;
}

export async function convertOccurrencesToHomeCurrency(
  occurrences: Occurrence[],
  homeCurrency: SupportedCurrency,
): Promise<Occurrence[]> {
  const accountRows = db.select().from(accounts).all();
  const accountCurrency = new Map(
    accountRows.map((a) => [
      a.id,
      parseAccountCurrency(a.currency, homeCurrency),
    ]),
  );

  await prefetchRatesToHome(
    db,
    occurrences.map((o) => ({
      date: o.date,
      from:
        o.accountId != null
          ? (accountCurrency.get(o.accountId) ?? homeCurrency)
          : homeCurrency,
    })),
    homeCurrency,
  );

  return occurrences.map((o) => {
    const cur =
      o.accountId != null
        ? (accountCurrency.get(o.accountId) ?? homeCurrency)
        : homeCurrency;
    const amt = convertToHome(db, o.amount, cur, homeCurrency, o.date);
    return { ...o, amount: amt };
  });
}
