export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { transactions, categories, accounts } from "@/lib/db/schema";
import { sql, and, gte, lte, lt, isNotNull, eq, ne, or, isNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, getCurrentMonth, getMonthRange, formatMonth } from "@/lib/utils";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import type { CategoryTotal, MonthlyTotal } from "@/types";
import { ArrowDownCircle, ArrowUpCircle, Wallet, TrendingDown, TrendingUp } from "lucide-react";

function getMonthlyTotals(months: string[]): MonthlyTotal[] {
  return months.map((month) => {
    const { start, end } = getMonthRange(month);
    const result = db
      .select({
        income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amount} > 0 THEN ${transactions.amount} ELSE 0 END), 0)`,
        expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          gte(transactions.date, start),
          lte(transactions.date, end),
          or(isNull(categories.type), ne(categories.type, "transfer"))
        )
      )
      .get();

    return {
      month,
      income: result?.income ?? 0,
      expenses: result?.expenses ?? 0,
      net: (result?.income ?? 0) - (result?.expenses ?? 0),
    };
  });
}

function getCategoryTotals(start: string, end: string): CategoryTotal[] {
  const rows = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Uncategorised')`,
      color: sql<string>`COALESCE(${categories.color}, '#9ca3af')`,
      total: sql<number>`SUM(ABS(${transactions.amount}))`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        lt(transactions.amount, sql`0`),
        or(isNull(categories.type), ne(categories.type, "transfer"))
      )
    )
    .groupBy(transactions.categoryId)
    .orderBy(sql`SUM(ABS(${transactions.amount})) DESC`)
    .all();

  return rows as CategoryTotal[];
}

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const months = getLast6Months();
  const currentMonth = getCurrentMonth();
  const { start, end } = getMonthRange(currentMonth);

  const monthlyTotals = getMonthlyTotals(months);
  const currentMonthData = monthlyTotals.find((m) => m.month === currentMonth) ?? {
    month: currentMonth,
    income: 0,
    expenses: 0,
    net: 0,
  };

  const categoryTotals = getCategoryTotals(start, end);

  const totalTransactions = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end)))
    .get()?.count ?? 0;

  const accountCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(accounts)
    .get()?.count ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{formatMonth(currentMonth)}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-income-bg flex items-center justify-center">
              <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(currentMonthData.income)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expenses</CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-expense-bg flex items-center justify-center">
              <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(currentMonthData.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-net-bg flex items-center justify-center">
              {currentMonthData.net >= 0
                ? <TrendingUp className="h-4 w-4 text-primary dark:text-blue-400" />
                : <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              }
            </div>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${currentMonthData.net >= 0 ? "text-primary dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
              {currentMonthData.net >= 0 ? "+" : ""}{formatCurrency(Math.abs(currentMonthData.net))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-tx-bg flex items-center justify-center">
              <Wallet className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTransactions}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{accountCount} account{accountCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <DashboardCharts
        monthlyTotals={monthlyTotals}
        categoryTotals={categoryTotals}
      />
    </div>
  );
}
