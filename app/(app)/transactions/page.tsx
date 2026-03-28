export const dynamic = "force-dynamic";

import { and, eq, gte, isNotNull, isNull, like, lte, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { CategoriseDialog } from "@/components/transactions/categorise-dialog";
import { ChatCategoriseDialog } from "@/components/transactions/chat-categorise-dialog";
import { ProcessUncategorisedButton } from "@/components/transactions/process-uncategorised-button";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { filterAssignableCategories } from "@/lib/categories/assignable";
import type { Category } from "@/types";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
    uncategorised?: string;
    needsReview?: string;
  }>;
}) {
  const params = await searchParams;

  const allAccounts = db.select().from(accounts).all();
  const allCatsRaw = db.select().from(categories).all() as Category[];
  const categoryMains = allCatsRaw
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const allCategories = filterAssignableCategories(allCatsRaw);

  // Build filters
  const filters = [];
  if (params.month) {
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

  const uncategorisedCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(isNull(transactions.categoryId))
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions
          </p>
          {needsReviewCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">
              {needsReviewCount} need category confirmation
            </p>
          )}
          {needsReviewCount > 0 && uncategorisedCount === 0 && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Bulk AI categorise only appears when some transactions have no category.
              These rows already have a suggested category — tick OK to confirm, or{" "}
              <Link
                href="/transactions?needsReview=1"
                className="text-primary underline underline-offset-2 hover:underline"
              >
                filter to needs confirmation
              </Link>
              .
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {uncategorisedCount > 0 && (
            <>
              <ProcessUncategorisedButton count={uncategorisedCount} />
              <CategoriseDialog
                uncategorisedCount={uncategorisedCount}
                categories={allCategories}
                categoryMains={categoryMains}
              />
              <ChatCategoriseDialog
                uncategorisedCount={uncategorisedCount}
                categories={allCategories}
              />
            </>
          )}
          <Button asChild size="sm">
            <Link href="/transactions/new">
              <Plus className="h-4 w-4 mr-2" />
              Add manual
            </Link>
          </Button>
        </div>
      </div>

      <TransactionTable
        rows={rows}
        accounts={allAccounts}
        categories={allCategories}
        categoryMains={categoryMains}
        currentFilters={params}
      />
    </div>
  );
}
