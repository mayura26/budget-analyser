"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { transactionsInRangeUrl } from "@/lib/analytics/transaction-links";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { AccountCashflowRow } from "@/types";

function truncateLabel(name: string, max = 14): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

function AccountsTooltip({
  active,
  payload,
  homeCurrency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  homeCurrency: SupportedCurrency;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="opacity-70">{entry.name}:</span>
          <span className="font-semibold">
            {formatCurrency(entry.value, homeCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsAccountsSection({
  accounts,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  accounts: AccountCashflowRow[];
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const barData = accounts.map((a) => ({
    name: truncateLabel(a.accountName),
    fullName: a.accountName,
    In: a.moneyIn,
    Out: a.moneyOut,
  }));

  const hasBarData = barData.some((d) => d.In > 0 || d.Out > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">By account</CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Money in and out in home currency (transfers excluded from totals).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasBarData && (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                barCategoryGap="24%"
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    `${(Number(v) / 1000).toFixed(0)}k ${homeCurrency}`
                  }
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={<AccountsTooltip homeCurrency={homeCurrency} />}
                  cursor={{ fill: "var(--color-accent)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.8125rem", paddingTop: "12px" }}
                />
                <Bar dataKey="In" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs text-right">Money in</TableHead>
                <TableHead className="text-xs text-right">Money out</TableHead>
                <TableHead className="text-xs text-right">Net</TableHead>
                <TableHead className="text-xs text-right w-[100px]">
                  View
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground text-sm py-8"
                  >
                    No transactions in this period
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.accountId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: a.color }}
                        />
                        <span className="truncate">{a.accountName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-600 dark:text-green-400">
                      {formatCurrency(a.moneyIn, homeCurrency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(a.moneyOut, homeCurrency)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        a.net >= 0
                          ? "text-primary dark:text-blue-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {a.net >= 0 ? "+" : ""}
                      {formatCurrency(Math.abs(a.net), homeCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={transactionsInRangeUrl({
                          from: rangeStart,
                          to: rangeEnd,
                          accountId: a.accountId,
                        })}
                        className="text-xs text-primary hover:underline"
                      >
                        Transactions
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
