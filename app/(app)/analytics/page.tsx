export const dynamic = "force-dynamic";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { AnalyticsAccountsSection } from "@/components/analytics/analytics-accounts-section";
import { AnalyticsCategoryExplorer } from "@/components/analytics/analytics-category-explorer";
import { AnalyticsMonthlyChart } from "@/components/analytics/analytics-monthly-chart";
import { AnalyticsPeriodSelector } from "@/components/analytics/analytics-period-selector";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatAnalyticsRangeLabel,
  parseAnalyticsSearchParams,
} from "@/lib/analytics/date-range";
import { getAnalyticsPageData } from "@/lib/analytics/queries";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import { getHomeCurrency } from "@/lib/currency/home";
import { formatCurrency } from "@/lib/utils";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const parsed = parseAnalyticsSearchParams({
    preset: params.preset,
    from: params.from,
    to: params.to,
  });
  const { start, end } = parsed.range;
  const homeCurrency = getHomeCurrency();
  const data = await getAnalyticsPageData(start, end, homeCurrency);
  const rangeLabel = formatAnalyticsRangeLabel(start, end);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Analytics"
        subtitle={
          <>
            <span>{rangeLabel}</span>
            <span className="block text-xs mt-1">
              Amounts in {homeCurrency}. Transfers are excluded from income,
              expense, and category totals.
            </span>
          </>
        }
        actions={
          <AnalyticsPeriodSelector
            preset={parsed.preset}
            rangeStart={start}
            rangeEnd={end}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income
            </CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-income-bg flex items-center justify-center">
              <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(data.summary.income, homeCurrency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-expense-bg flex items-center justify-center">
              <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(data.summary.expenses, homeCurrency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net
            </CardTitle>
            <div className="h-9 w-9 rounded-full bg-kpi-net-bg flex items-center justify-center">
              {data.summary.net >= 0 ? (
                <TrendingUp className="h-4 w-4 text-primary dark:text-blue-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                data.summary.net >= 0
                  ? "text-primary dark:text-blue-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {data.summary.net >= 0 ? "+" : ""}
              {formatCurrency(Math.abs(data.summary.net), homeCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm">
        <Link
          href={transactionsInRangeUrl({ from: start, to: end })}
          className="text-primary hover:underline font-medium"
        >
          View all transactions in this period
        </Link>
      </p>

      <AnalyticsMonthlyChart
        monthly={data.monthly}
        homeCurrency={homeCurrency}
      />

      <AnalyticsAccountsSection
        accounts={data.accounts}
        rangeStart={start}
        rangeEnd={end}
        homeCurrency={homeCurrency}
      />

      <AnalyticsCategoryExplorer
        categoryRoots={data.categoryRoots}
        expenseTransactionsByCategory={data.expenseTransactionsByCategory}
        rangeStart={start}
        rangeEnd={end}
        homeCurrency={homeCurrency}
      />
    </div>
  );
}
