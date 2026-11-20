"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpendAnalysisLine } from "@/lib/analytics/queries";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import {
  addCalendarMonths,
  formatDate,
  formatMonth,
  formatSignedCurrency,
  getMonthRange,
} from "@/lib/utils";
import type { BudgetCategoryRow } from "@/types";

type CategoryOption = Pick<
  BudgetCategoryRow,
  "categoryId" | "categoryName" | "parentName"
>;

function totalSpend(lines: SpendAnalysisLine[]) {
  return lines.reduce((sum, line) => sum + line.netSpend, 0);
}

export function SpendAnalysis({
  month,
  currentMonth,
  today,
  earliest,
  category,
  categories,
  lines,
  homeCurrency,
}: {
  month: string;
  currentMonth: string;
  today: string;
  earliest: string | null;
  category?: BudgetCategoryRow;
  categories: CategoryOption[];
  lines: SpendAnalysisLine[];
  homeCurrency: string;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(month);
  const [merchant, setMerchant] = useState<string | null>(null);

  if (!category) return <p>No expense categories to analyse.</p>;

  const money = (amount: number) => formatSignedCurrency(amount, homeCurrency);
  const monthToDate = month === currentMonth;
  const comparisonDay = monthToDate ? today.slice(-2) : null;
  const trend = Array.from({ length: 6 }, (_, index) => {
    const value = addCalendarMonths(month, index - 5);
    const monthLines = lines.filter((line) => line.date.startsWith(value));
    return { value, total: totalSpend(monthLines), lines: monthLines };
  });
  const selected = trend.find((point) => point.value === period) ?? trend[5];
  const baseline = trend
    .slice(2, 5)
    .filter(
      ({ value }) =>
        earliest !== null && value >= earliest && value < currentMonth,
    );
  const comparableActual = totalSpend(
    trend[5].lines.filter(
      (line) => comparisonDay === null || line.date.slice(-2) <= comparisonDay,
    ),
  );
  const average =
    baseline.length && month <= currentMonth
      ? baseline.reduce(
          (sum, point) =>
            sum +
            totalSpend(
              point.lines.filter(
                (line) =>
                  comparisonDay === null ||
                  line.date.slice(-2) <= comparisonDay,
              ),
            ),
          0,
        ) / baseline.length
      : null;
  const difference = average === null ? null : comparableActual - average;
  const remaining = category.targetAmount - category.actualSpent;
  const purchases = selected.lines.filter((line) => line.netSpend > 0);
  const merchants = new Map<
    string,
    { label: string; total: number; count: number }
  >();
  for (const line of selected.lines) {
    const entry = merchants.get(line.merchantKey) ?? {
      label: line.merchant,
      total: 0,
      count: 0,
    };
    entry.total += line.netSpend;
    entry.count += 1;
    merchants.set(line.merchantKey, entry);
  }
  const ranking = [...merchants].sort(
    ([, a], [, b]) => b.total - a.total || a.label.localeCompare(b.label),
  );
  const largestMerchant = Math.max(
    1,
    ...ranking.map(([, entry]) => Math.abs(entry.total)),
  );
  const largestMonth = Math.max(
    1,
    ...trend.map((point) => Math.abs(point.total)),
  );
  const showShare =
    selected.total > 0 && ranking.every(([, entry]) => entry.total >= 0);
  const visible = selected.lines.filter(
    (line) => merchant === null || line.merchantKey === merchant,
  );
  const range = getMonthRange(period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Spend Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Explore the merchants and transactions behind your spending.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Expense category
          <select
            className="w-full max-w-[min(80vw,24rem)] rounded-md border bg-background px-3 py-2 text-sm"
            value={category.categoryId}
            onChange={(event) =>
              router.push(
                `/budget?month=${month}&tab=spend-analysis&category=${event.target.value}`,
                { scroll: false },
              )
            }
          >
            {categories.map((option) => (
              <option key={option.categoryId} value={option.categoryId}>
                {option.categoryName} · {option.parentName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">
            Net spend · {formatMonth(month)}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {money(category.actualSpent)}
          </dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">
            {remaining < 0 && category.targetAmount > 0
              ? "Over budget"
              : "Budget remaining"}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {category.targetAmount > 0
              ? money(Math.abs(remaining))
              : "No target"}
          </dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">
            {average === null
              ? "Change from recent spending"
              : `vs. previous ${baseline.length}-month average${monthToDate ? " to date" : ""}`}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {difference === null
              ? "No comparison"
              : `${difference >= 0.005 ? "+" : ""}${money(difference)}`}
          </dd>
        </div>
      </dl>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Spending by merchant</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatMonth(period)} · {purchases.length} purchases
              {purchases.length > 0 &&
                ` · ${money(totalSpend(purchases) / purchases.length)} average purchase`}
            </p>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
            {ranking.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No spending activity in this month.
              </p>
            )}
            {ranking.map(([key, entry]) => (
              <button
                type="button"
                key={key}
                aria-pressed={merchant === key}
                onClick={() => setMerchant(merchant === key ? null : key)}
                className="w-full space-y-1 rounded-md p-2 text-left hover:bg-muted aria-pressed:bg-muted"
              >
                <span className="flex justify-between gap-2 text-sm font-medium">
                  <span className="break-all">{entry.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {money(entry.total)}
                  </span>
                </span>
                <span
                  className="block h-2 overflow-hidden rounded-full bg-muted-foreground/15"
                  aria-hidden="true"
                >
                  <span
                    className={`block h-full rounded-full ${entry.total < 0 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{
                      width: `${(Math.abs(entry.total) / largestMerchant) * 100}%`,
                    }}
                  />
                </span>
                <span className="block text-xs text-muted-foreground">
                  {entry.count}{" "}
                  {entry.count === 1 ? "transaction" : "transactions"}
                  {showShare &&
                    ` · ${Math.round((entry.total / selected.total) * 100)}% of net spend`}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending trend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {trend.map(({ value, total }) => (
              <button
                type="button"
                key={value}
                aria-pressed={value === period}
                onClick={() => {
                  setPeriod(value);
                  setMerchant(null);
                }}
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted aria-pressed:bg-muted"
              >
                <span className="w-24 shrink-0">{formatMonth(value)}</span>
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted-foreground/15"
                  aria-hidden="true"
                >
                  <span
                    className={`block h-full rounded-full ${total < 0 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{
                      width: `${(Math.abs(total) / largestMonth) * 100}%`,
                    }}
                  />
                </span>
                <span className="shrink-0 tabular-nums">{money(total)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions · {formatMonth(period)}</CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground" aria-live="polite">
              {visible.length}{" "}
              {visible.length === 1 ? "transaction" : "transactions"}
              {merchant !== null && ` · ${merchants.get(merchant)?.label}`}
            </p>
            {merchant !== null ? (
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMerchant(null)}
              >
                Clear merchant filter
              </button>
            ) : (
              <Link
                className="text-primary underline"
                href={transactionsInRangeUrl({
                  from: range.start,
                  to: range.end,
                  categoryId: category.categoryId,
                })}
              >
                Open in Transactions
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          <ul className="divide-y">
            {visible.map((line) => (
              <li
                key={line.id}
                className="flex items-start justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{line.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(line.date)} · {line.accountName}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {money(line.netSpend)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
