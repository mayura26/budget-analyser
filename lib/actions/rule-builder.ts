"use server";

import { desc, eq, sql } from "drizzle-orm";
import { amountsInHomeCurrency } from "@/lib/currency/convert";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

export type RuleBuilderTransactionRow = {
  id: number;
  date: string;
  description: string;
  normalised: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  accountName: string;
};

const MAX_SAMPLE = 150;

/** Recent transactions for AI rule-builder context (capped for token limits). */
export async function getRuleBuilderTransactionSample(
  options: { unverifiedOnly?: boolean } = {},
): Promise<ActionResult<RuleBuilderTransactionRow[]>> {
  const unverifiedOnly = options.unverifiedOnly ?? false;

  const base = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      normalised: transactions.normalised,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
      accountCurrency: sql<string>`COALESCE(${accounts.currency}, 'AUD')`,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id));

  const rowsRaw = unverifiedOnly
    ? base
        .where(eq(transactions.categoryConfirmed, false))
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(MAX_SAMPLE)
        .all()
    : base
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(MAX_SAMPLE)
        .all();

  const homeCurrency = getHomeCurrency();
  const amountsHome = await amountsInHomeCurrency(
    db,
    rowsRaw.map((r) => ({
      amount: r.amount,
      date: r.date,
      accountCurrency: r.accountCurrency,
    })),
    homeCurrency,
  );

  const rows: RuleBuilderTransactionRow[] = rowsRaw.map((r, i) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    normalised: r.normalised,
    amount: amountsHome[i] ?? r.amount,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    accountName: r.accountName,
  }));

  return { success: true, data: rows };
}
