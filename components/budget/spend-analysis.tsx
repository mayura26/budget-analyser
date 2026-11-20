"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpendAnalysisLine } from "@/lib/analytics/queries";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import {
  addCalendarMonths,
  budgetCategoryShortTitle,
  formatDate,
  formatMonth,
  formatSignedCurrency,
  getMonthRange,
} from "@/lib/utils";
import type { BudgetCategoryRow } from "@/types";

type CategorySummary = Pick<
  BudgetCategoryRow,
  "categoryId" | "categoryName" | "actualSpent" | "targetAmount"
>;

type CategoryGroup = CategorySummary & {
  children: Pick<
    CategorySummary,
    "categoryId" | "categoryName" | "actualSpent"
  >[];
};

function totalSpend(lines: SpendAnalysisLine[]) {
  return lines.reduce((sum, line) => sum + line.netSpend, 0);
}

const merchantColors = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-teal-500",
  "bg-violet-500",
];

export function SpendAnalysis({
  month,
  currentMonth,
  today,
  earliest,
  category,
  groups,
  groupSelected,
  lines,
  homeCurrency,
}: {
  month: string;
  currentMonth: string;
  today: string;
  earliest: string | null;
  category?: CategorySummary;
  groups: CategoryGroup[];
  groupSelected: boolean;
  lines: SpendAnalysisLine[];
  homeCurrency: string;
}) {
  const [period, setPeriod] = useState(month);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!category) return <p>No expense categories to analyse.</p>;

  const money = (amount: number) => formatSignedCurrency(amount, homeCurrency);
  const trendMoney = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: homeCurrency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  });
  const compactTrendMoney = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: homeCurrency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const monthToDate = month === currentMonth;
  const comparisonDay = monthToDate ? today.slice(-2) : null;
  const history = Array.from({ length: 7 }, (_, index) => {
    const value = addCalendarMonths(month, index - 6);
    const monthLines = lines.filter((line) => line.date.startsWith(value));
    return { value, total: totalSpend(monthLines), lines: monthLines };
  });
  const trend = history.slice(1);
  const selected = trend.find((point) => point.value === period) ?? trend[5];
  const comparableSpend = (monthLines: SpendAnalysisLine[]) =>
    totalSpend(
      monthLines.filter(
        (line) =>
          comparisonDay === null || line.date.slice(-2) <= comparisonDay,
      ),
    );
  const baseline = history
    .slice(0, -1)
    .filter(
      ({ value }) =>
        earliest !== null && value >= earliest && value < currentMonth,
    )
    .map((point) => comparableSpend(point.lines));
  const comparableActual = comparableSpend(trend[5].lines);
  const averageFor = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const average3 = averageFor(baseline.slice(-3));
  const average6 = averageFor(baseline);
  const difference =
    average3 === null || month > currentMonth
      ? null
      : comparableActual - average3;
  const low = Math.min(...baseline);
  const high = Math.max(...baseline);
  const rangeMin = Math.min(low, comparableActual);
  const rangeMax = Math.max(high, comparableActual);
  const position = (amount: number) =>
    rangeMin === rangeMax
      ? 50
      : 4 + (92 * (amount - rangeMin)) / (rangeMax - rangeMin);
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
  const merchantSegments = ranking.slice(0, 4).map(([key, entry], index) => ({
    key,
    size: Math.abs(entry.total),
    color: entry.total < 0 ? "bg-emerald-500" : merchantColors[index],
  }));
  const extraMerchants = ranking.slice(4);
  const extraSize = extraMerchants.reduce(
    (sum, [, entry]) => sum + Math.abs(entry.total),
    0,
  );
  const mixTotal =
    merchantSegments.reduce((sum, segment) => sum + segment.size, extraSize) ||
    1;
  const chartMin = Math.min(0, ...trend.map((point) => point.total));
  const chartMax = Math.max(0, ...trend.map((point) => point.total));
  const chartSpan = chartMax - chartMin || 1;
  const zero = (-chartMin / chartSpan) * 100;
  const visible = selected.lines.filter(
    (line) => merchant === null || line.merchantKey === merchant,
  );
  const range = getMonthRange(period);

  const analysisHref = (id: number) =>
    `/budget?month=${month}&tab=spend-analysis&category=${id}`;
  const categoryNames = new Map(
    groups.flatMap((group) =>
      group.children.map(
        (child) =>
          [
            child.categoryId,
            budgetCategoryShortTitle(child.categoryName),
          ] as const,
      ),
    ),
  );

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]">
      <nav
        aria-label="Expense categories"
        className="space-y-1 rounded-xl border bg-card p-2"
      >
        {groups.map((group) => {
          const active =
            group.categoryId === category.categoryId ||
            group.children.some(
              (child) => child.categoryId === category.categoryId,
            );
          return (
            <details key={group.categoryId} open={active} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground group-open:rotate-90"
                />
                <span className="min-w-0 flex-1">{group.categoryName}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {money(group.actualSpent)}
                </span>
              </summary>
              <ul className="mb-1 ml-4 space-y-0.5 border-l pl-2">
                <li>
                  <Link
                    href={analysisHref(group.categoryId)}
                    scroll={false}
                    aria-current={
                      group.categoryId === category.categoryId
                        ? "page"
                        : undefined
                    }
                    className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary"
                  >
                    All {group.categoryName}
                  </Link>
                </li>
                {group.children.map((child) => (
                  <li key={child.categoryId}>
                    <Link
                      href={analysisHref(child.categoryId)}
                      scroll={false}
                      aria-current={
                        child.categoryId === category.categoryId
                          ? "page"
                          : undefined
                      }
                      title={child.categoryName}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary"
                    >
                      <span className="min-w-0">
                        {budgetCategoryShortTitle(child.categoryName)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums">
                        {money(child.actualSpent)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </nav>

      <section aria-label="Spending breakdown" className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold">
          {budgetCategoryShortTitle(category.categoryName)}
        </h2>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-4 2xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(12rem,1.5fr)]">
          <div>
            <dt className="text-sm text-muted-foreground">
              Net spend · {formatMonth(month)}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {money(category.actualSpent)}
            </dd>
          </div>
          <div>
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
            {category.targetAmount > 0 && (
              <div
                className="mt-1.5 h-1.5 max-w-40 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${remaining < 0 ? "bg-rose-500" : "bg-primary"}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (category.actualSpent / category.targetAmount) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              3-month average{monthToDate ? " to date" : ""}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {average3 === null ? "No history" : money(average3)}
            </dd>
            {difference !== null && (
              <dd className="text-xs text-muted-foreground">
                {difference >= 0.005 ? "+" : ""}
                {money(difference)} this month
              </dd>
            )}
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              6-month average{monthToDate ? " to date" : ""}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {average6 === null ? "No history" : money(average6)}
            </dd>
            {baseline.length > 0 && baseline.length < 6 && (
              <dd className="text-xs text-muted-foreground">
                Based on {baseline.length}{" "}
                {baseline.length === 1 ? "month" : "months"}
              </dd>
            )}
          </div>
          <div className="col-span-2 sm:col-span-4 2xl:col-span-1">
            <dt className="text-sm text-muted-foreground">
              Recent range{monthToDate ? " to date" : ""}
            </dt>
            <dd>
              {difference === null ? (
                <span className="text-sm text-muted-foreground">
                  No comparison available
                </span>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Historical range ${money(low)} to ${money(high)}. Selected month ${money(comparableActual)}.`}
                    className="relative my-2 h-2 rounded-full bg-muted"
                  >
                    <span
                      className="absolute h-full min-w-0.5 rounded-full bg-primary/40"
                      style={{
                        left: `${position(low)}%`,
                        width: `${position(high) - position(low)}%`,
                      }}
                    />
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
                      style={{ left: `${position(comparableActual)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-xs tabular-nums text-muted-foreground">
                    <span>{money(low)} low</span>
                    <span className="font-medium text-foreground">
                      {money(comparableActual)} selected
                    </span>
                    <span>{money(high)} high</span>
                  </div>
                </>
              )}
            </dd>
          </div>
        </dl>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">Merchant mix</CardTitle>
              <p className="text-xs text-muted-foreground">
                {purchases.length}{" "}
                {purchases.length === 1 ? "purchase" : "purchases"}
                {purchases.length > 0 &&
                  ` · ${money(totalSpend(purchases) / purchases.length)} average`}
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity in {formatMonth(period)}.
                </p>
              ) : (
                <>
                  <div
                    aria-hidden="true"
                    className="mb-2 flex h-3 gap-px overflow-hidden rounded-full bg-muted"
                  >
                    {merchantSegments.map(
                      (segment) =>
                        segment.size > 0 && (
                          <span
                            key={segment.key}
                            className={`${segment.color} ${merchant !== null && merchant !== segment.key ? "opacity-35" : ""}`}
                            style={{
                              width: `${(segment.size / mixTotal) * 100}%`,
                            }}
                          />
                        ),
                    )}
                    {extraSize > 0 && (
                      <span
                        className="bg-muted-foreground/40"
                        style={{ width: `${(extraSize / mixTotal) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    {ranking
                      .slice(0, expanded ? ranking.length : 4)
                      .map(([key, entry], index) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={merchant === key}
                          onClick={() =>
                            setMerchant(merchant === key ? null : key)
                          }
                          className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-muted aria-pressed:bg-muted"
                          title={`${entry.label} · ${entry.count} ${entry.count === 1 ? "transaction" : "transactions"}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`size-2 shrink-0 rounded-full ${merchantSegments[index]?.color ?? "bg-muted-foreground/40"}`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {entry.label}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {money(entry.total)}
                          </span>
                        </button>
                      ))}
                  </div>
                  {extraMerchants.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpanded(!expanded)}
                      className="mt-1 rounded px-1.5 py-1 text-xs text-primary hover:underline"
                    >
                      {expanded
                        ? "Show fewer merchants"
                        : `Show ${extraMerchants.length} more ${extraMerchants.length === 1 ? "merchant" : "merchants"}`}
                    </button>
                  )}
                  {ranking.some(([, entry]) => entry.total < 0) && (
                    <p className="mt-1 px-1.5 text-xs text-muted-foreground">
                      Segment sizes show net amounts by magnitude. Negative
                      amounts indicate net refunds.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">Six-month trend</CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatMonth(period)} ·{" "}
                <span className="font-medium text-foreground">
                  {money(selected.total)} net
                </span>
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="relative grid grid-cols-6 gap-1">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-5 h-24"
                >
                  <div
                    className="absolute inset-x-0 border-t border-border"
                    style={{ bottom: `${zero}%` }}
                  />
                </div>
                {trend.map(({ value, total }) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={`${formatMonth(value)}, ${money(total)} net spend`}
                    title={`${formatMonth(value)} · ${money(total)}`}
                    aria-pressed={value === period}
                    onClick={() => {
                      setPeriod(value);
                      setMerchant(null);
                      setExpanded(false);
                    }}
                    className="relative min-w-0 rounded-md pt-5 text-xs text-muted-foreground hover:bg-muted/60 aria-pressed:bg-muted/60 aria-pressed:font-semibold aria-pressed:text-foreground"
                  >
                    <span aria-hidden="true" className="relative block h-24">
                      <span
                        className="absolute inset-x-0 mb-0.5 whitespace-nowrap text-center text-[10px] font-medium leading-4 text-foreground tabular-nums sm:text-xs"
                        style={{
                          bottom: `${((Math.max(0, total) - chartMin) / chartSpan) * 100}%`,
                        }}
                      >
                        {Math.abs(total) >= 10_000
                          ? compactTrendMoney.format(total)
                          : trendMoney.format(total)}
                      </span>
                      <span
                        className={`absolute inset-x-1/4 rounded-sm ${total < 0 ? "bg-emerald-500" : value === period ? "bg-primary" : "bg-primary/40"}`}
                        style={{
                          bottom: `${((Math.min(0, total) - chartMin) / chartSpan) * 100}%`,
                          height: `${(Math.abs(total) / chartSpan) * 100}%`,
                        }}
                      />
                    </span>
                    <span aria-hidden="true" className="block py-1.5">
                      {formatMonth(value).slice(0, 3)}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">
              Transactions · {formatMonth(period)}
            </CardTitle>
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
                !groupSelected && (
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
                )
              )}
            </div>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto px-4 pb-3">
            <ul className="divide-y">
              {visible.map((line) => (
                <li
                  key={line.id}
                  className="flex items-start justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">
                      {line.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(line.date)} · {line.accountName}
                      {groupSelected &&
                        ` · ${categoryNames.get(line.categoryId)}`}
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
      </section>
    </div>
  );
}
