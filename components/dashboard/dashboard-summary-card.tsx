import {
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency } from "@/lib/utils";

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p
          className={cn(
            "text-xl font-bold tabular-nums leading-tight",
            valueClass,
          )}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function DashboardSummaryCard({
  income,
  expenses,
  net,
  savings,
  transactionCount,
  accountCount,
  homeCurrency,
}: {
  income: number;
  expenses: number;
  net: number;
  savings: number;
  transactionCount: number;
  accountCount: number;
  homeCurrency: SupportedCurrency;
}) {
  const netPositive = net >= 0;

  return (
    <Card>
      <CardContent className="pt-5 pb-4 sm:pt-6 sm:pb-5">
        {/* Primary row: Income, Expenses, Net */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <Stat
            label="Income"
            value={formatCurrency(income, homeCurrency)}
            icon={ArrowUpCircle}
            iconClass="text-green-600 dark:text-green-400"
            valueClass="text-green-600 dark:text-green-400"
          />
          <Stat
            label="Expenses"
            value={formatCurrency(expenses, homeCurrency)}
            icon={ArrowDownCircle}
            iconClass="text-red-600 dark:text-red-400"
            valueClass="text-red-600 dark:text-red-400"
          />
          <Stat
            label="Net"
            value={`${netPositive ? "+" : ""}${formatCurrency(Math.abs(net), homeCurrency)}`}
            sub="After tracked savings"
            icon={netPositive ? TrendingUp : TrendingDown}
            iconClass={
              netPositive
                ? "text-primary dark:text-blue-400"
                : "text-red-600 dark:text-red-400"
            }
            valueClass={
              netPositive
                ? "text-primary dark:text-blue-400"
                : "text-red-600 dark:text-red-400"
            }
          />
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-border" />

        {/* Secondary row: Savings, Transactions */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <Stat
            label="Savings"
            value={formatCurrency(savings, homeCurrency)}
            sub="Tracked allocations"
            icon={PiggyBank}
            iconClass="text-purple-600 dark:text-purple-400"
          />
          <Stat
            label="Transactions"
            value={transactionCount}
            sub={`${accountCount} account${accountCount !== 1 ? "s" : ""}`}
            icon={Wallet}
            iconClass="text-purple-600 dark:text-purple-400"
          />
        </div>
      </CardContent>
    </Card>
  );
}
