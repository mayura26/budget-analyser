export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { transactions, categories, accounts } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, like, isNull } from "drizzle-orm";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { CategoriseDialog } from "@/components/transactions/categorise-dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
    uncategorised?: string;
  }>;
}) {
  const params = await searchParams;

  const allAccounts = db.select().from(accounts).all();
  const allCategories = db.select().from(categories).all();

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
    filters.push(eq(transactions.accountId, parseInt(params.accountId)));
  }
  if (params.categoryId === "none") {
    filters.push(isNull(transactions.categoryId));
  } else if (params.categoryId) {
    filters.push(eq(transactions.categoryId, parseInt(params.categoryId)));
  }
  if (params.search) {
    filters.push(like(transactions.description, `%${params.search}%`));
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

  const uncategorisedCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(isNull(transactions.categoryId))
    .get()?.count ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">{rows.length} transactions</p>
        </div>
        <div className="flex gap-2">
          {uncategorisedCount > 0 && (
            <CategoriseDialog
              uncategorisedCount={uncategorisedCount}
              categories={allCategories}
            />
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
        currentFilters={params}
      />
    </div>
  );
}
