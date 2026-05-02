export const dynamic = "force-dynamic";

import { and, gte, lte, sql } from "drizzle-orm";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { BudgetProgressBar } from "@/components/budget/budget-progress-bar";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DashboardMonthPicker } from "@/components/dashboard/dashboard-month-picker";
import { KPICard } from "@/components/layout/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getActualIncomeForMonth,
  getScheduledAmountsByCategory,
  hasBudgetTargets,
} from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import {
  getCategoryBreakdownInHomeCurrency,
  getMonthlyTotalsInHomeCurrency,
} from "@/lib/dashboard/home-currency-totals";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import {
  enumerateMonthsInclusive,
  formatCurrency,
  formatMonth,
  getCurrentMonth,
  getMonthRange,
  getMonthsEndingAt,
  parseMonthParam,
} from "@/lib/utils";
import type { Category } from "@/types";

function getEarliestTransactionMonth(): string | null {
  const row = db
    .select({ d: sql<string>`MIN(${transactions.date})` })
    .from(transactions)
    .get();
  if (!row?.d) return null;
  return row.d.slice(0, 7);
}

async function DashboardBudgetStatus({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  if (!hasBudgetTargets(selectedMonth)) return null;

  const homeCurrency = getHomeCurrency();
  const allCats = db.select().from(categories).all() as Category[];
  const rows = await buildBudgetCategoryRows(
    selectedMonth,
    allCats,
    homeCurrency,
  );
  const { income } = await getScheduledAmountsByCategory(
    selectedMonth,
    homeCurrency,
  );
  const actualIncome = await getActualIncomeForMonth(selectedMonth, homeCurrency);
  const summary = buildBudgetSummary(rows, selectedMonth, income, actualIncome);

  const budgetedRows = rows.filter(
    (r) => r.targetAmount > 0 && r.categoryKind === "expense",
  );
  // Top categories closest to / over budget
  const topCategories = [...budgetedRows]
    .sort(
      (a, b) => b.actualSpent / b.targetAmount - a.actualSpent / a.targetAmount,
    )
    .slice(0, 3);

  const pctUsed =
    summary.totalBudgeted > 0
      ? Math.round((summary.totalSpent / summary.totalBudgeted) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Budget Status
        </CardTitle>
        <Link
          href={`/budget?month=${selectedMonth}`}
          className="text-xs text-primary hover:underline"
        >
          View full budget
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span>
              {formatCurrency(summary.totalSpent, homeCurrency)} of{" "}
              {formatCurrency(summary.totalBudgeted, homeCurrency)} spent
            </span>
            <span
              className={
                summary.onTrack
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {pctUsed}%
            </span>
          </div>
          <BudgetProgressBar
            spent={summary.totalSpent}
            target={summary.totalBudgeted}
          />
        </div>

        {topCategories.length > 0 && (
          <div className="space-y-1.5">
            {topCategories.map((row) => {
              const catPct =
                row.targetAmount > 0
                  ? Math.round((row.actualSpent / row.targetAmount) * 100)
                  : 0;
              return (
                <div
                  key={row.categoryId}
                  className="flex flex-col gap-1.5 text-xs sm:flex-row sm:items-center sm:gap-2"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="wrap-break-word min-w-0 flex-1 leading-snug">
                      {row.categoryName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-3 pl-6 sm:pl-0">
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(row.actualSpent, homeCurrency)} /{" "}
                      {formatCurrency(row.targetAmount, homeCurrency)}
                    </span>
                    <span
                      className={`tabular-nums w-8 text-right ${
                        catPct > 100
                          ? "text-red-600 dark:text-red-400"
                          : catPct >= 75
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {catPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const homeCurrency = getHomeCurrency();
  const maxMonth = getCurrentMonth();
  const earliest = getEarliestTransactionMonth();
  const minMonth = earliest
    ? earliest < maxMonth
      ? earliest
      : maxMonth
    : maxMonth;

  const selectedMonth = parseMonthParam(params.month, minMonth, maxMonth);
  const months = getMonthsEndingAt(selectedMonth, 6);
  const { start, end } = getMonthRange(selectedMonth);

  const monthlyTotals = await getMonthlyTotalsInHomeCurrency(
    months,
    homeCurrency,
  );
  const currentMonthData = monthlyTotals.find(
    (m) => m.month === selectedMonth,
  ) ?? {
    month: selectedMonth,
    income: 0,
    expenses: 0,
    savings: 0,
    net: 0,
  };

  const monthOptions = enumerateMonthsInclusive(minMonth, maxMonth);

  const { expenseTotals } = await getCategoryBreakdownInHomeCurrency(
    start,
    end,
    homeCurrency,
  );

  const totalTransactions =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end)))
      .get()?.count ?? 0;

  const accountCount =
    db.select({ count: sql<number>`COUNT(*)` }).from(accounts).get()?.count ??
    0;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Summary and category breakdown for ${formatMonth(selectedMonth)}`}
        actions={
          <DashboardMonthPicker
            selectedMonth={selectedMonth}
            minMonth={minMonth}
            maxMonth={maxMonth}
            monthOptions={monthOptions}
          />
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        <KPICard
          compact
          label="Income"
          icon={ArrowUpCircle}
          tone="income"
          value={formatCurrency(currentMonthData.income, homeCurrency)}
        />
        <KPICard
          compact
          label="Expenses"
          icon={ArrowDownCircle}
          tone="expense"
          value={formatCurrency(currentMonthData.expenses, homeCurrency)}
        />
        <KPICard
          compact
          label="Savings"
          icon={PiggyBank}
          tone="neutral"
          value={formatCurrency(currentMonthData.savings, homeCurrency)}
          subtitle="Allocated to savings categories"
        />
        <KPICard
          compact
          label="Net"
          icon={currentMonthData.net >= 0 ? TrendingUp : TrendingDown}
          tone={currentMonthData.net >= 0 ? "net-positive" : "net-negative"}
          value={`${currentMonthData.net >= 0 ? "+" : ""}${formatCurrency(Math.abs(currentMonthData.net), homeCurrency)}`}
        />
        <KPICard
          compact
          label="Transactions"
          icon={Wallet}
          tone="neutral"
          value={totalTransactions}
          subtitle={`${accountCount} account${accountCount !== 1 ? "s" : ""}`}
        />
      </div>

      {/* Budget Status */}
      <DashboardBudgetStatus selectedMonth={selectedMonth} />

      {/* Charts */}
      <DashboardCharts
        monthlyTotals={monthlyTotals}
        categoryExpenseTotals={expenseTotals}
        monthNet={currentMonthData.net}
        monthSavings={currentMonthData.savings}
        homeCurrency={homeCurrency}
      />
    </div>
  );
}
