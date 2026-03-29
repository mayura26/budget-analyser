export const dynamic = "force-dynamic";

import { and, eq, gte, isNotNull, isNull, like, lte, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { TransactionActions } from "@/components/transactions/transaction-actions";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/actions/settings";
import { isValidISODate } from "@/lib/analytics/date-range";
import { filterAssignableCategories } from "@/lib/categories/assignable";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import type { Category } from "@/types";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    from?: string;
    to?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
    uncategorised?: string;
    needsReview?: string;
  }>;
}) {
  const params = await searchParams;
  const homeCurrency = getHomeCurrency();
  const settingsMap = await getSettings();
  const transactionAmountDisplay =
    settingsMap.transaction_amount_display === "home" ? "home" : "account";

  const allAccounts = db.select().from(accounts).all();
  const allCatsRaw = db.select().from(categories).all() as Category[];
  const categoryMains = allCatsRaw
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const allCategories = filterAssignableCategories(allCatsRaw);

  const dateRangeActive =
    params.from &&
    params.to &&
    isValidISODate(params.from) &&
    isValidISODate(params.to) &&
    params.from <= params.to;

  // Build filters
  const filters = [];
  if (dateRangeActive && params.from && params.to) {
    filters.push(gte(transactions.date, params.from));
    filters.push(lte(transactions.date, params.to));
  } else if (params.month) {
    const [year, month] = params.month.split("-").map(Number);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    filters.push(gte(transactions.date, start));
    filters.push(lte(transactions.date, end));
  }
  if (params.accountId) {
    filters.push(eq(transactions.accountId, parseInt(params.accountId, 10)));
  }
  if (params.categoryId === "none") {
    filters.push(isNull(transactions.categoryId));
  } else if (params.categoryId) {
    filters.push(eq(transactions.categoryId, parseInt(params.categoryId, 10)));
  }
  if (params.search) {
    filters.push(like(transactions.description, `%${params.search}%`));
  }
  if (params.needsReview === "1") {
    filters.push(
      and(
        isNotNull(transactions.categoryId),
        eq(transactions.categoryConfirmed, false),
      ),
    );
  }

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: sql<string>`${categories.name}`,
      categoryColor: sql<string>`${categories.color}`,
      categoryType: sql<string>`${categories.type}`,
      accountId: transactions.accountId,
      accountName: sql<string>`${accounts.name}`,
      accountColor: sql<string>`${accounts.color}`,
      accountCurrency: sql<string>`${accounts.currency}`,
      categorySource: transactions.categorySource,
      categoryConfirmed: transactions.categoryConfirmed,
      notes: transactions.notes,
      linkedTransactionId: transactions.linkedTransactionId,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(sql`${transactions.date} DESC, ${transactions.id} DESC`)
    .limit(1000)
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.accountCurrency, homeCurrency),
    })),
    homeCurrency,
  );

  const rowsWithHome = rows.map((r) => {
    const ccy = parseAccountCurrency(r.accountCurrency, homeCurrency);
    const amountInHome = convertToHome(db, r.amount, ccy, homeCurrency, r.date);
    return { ...r, amountInHome };
  });

  const uncategorisedCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(isNull(transactions.categoryId))
      .get()?.count ?? 0;

  const unfinalisedCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(eq(transactions.categoryConfirmed, false))
      .get()?.count ?? 0;

  const needsReviewCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(
        and(
          isNotNull(transactions.categoryId),
          eq(transactions.categoryConfirmed, false),
        ),
      )
      .get()?.count ?? 0;

  const confirmedCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryConfirmed, true),
          isNotNull(transactions.categoryId),
        ),
      )
      .get()?.count ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions
            {dateRangeActive && (
              <>
                {" "}
                · {params.from} to {params.to}
              </>
            )}
          </p>
          {needsReviewCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">
              {needsReviewCount} need category confirmation
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <TransactionActions
            uncategorisedCount={uncategorisedCount}
            unfinalisedCount={unfinalisedCount}
            confirmedCount={confirmedCount}
            categories={allCategories}
            categoryMains={categoryMains}
          />
          <Button asChild size="sm">
            <Link href="/transactions/new">
              <Plus className="h-4 w-4 mr-2" />
              Add manual
            </Link>
          </Button>
        </div>
      </div>

      <TransactionTable
        rows={rowsWithHome}
        accounts={allAccounts}
        categories={allCategories}
        categoryMains={categoryMains}
        currentFilters={params}
        homeCurrency={homeCurrency}
        transactionAmountDisplay={transactionAmountDisplay}
      />
    </div>
  );
}
