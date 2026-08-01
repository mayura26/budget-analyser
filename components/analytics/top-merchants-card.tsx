import { AlertTriangle, Repeat, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency } from "@/lib/utils";
import type { TopMerchantSpend } from "@/types";

const FLAG_LABELS: Record<TopMerchantSpend["flagReasons"][number], string> = {
  frequent: "Frequent",
  high_spend: "High spend",
  high_average: "High avg",
};

function MerchantFlags({
  reasons,
}: {
  reasons: TopMerchantSpend["flagReasons"];
}) {
  if (reasons.length === 0) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-medium uppercase tracking-wide"
      >
        Watch
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {reasons.map((reason) => (
        <Badge
          key={reason}
          variant="outline"
          className={cn(
            "border text-[10px] font-medium uppercase tracking-wide",
            reason === "frequent" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            reason === "high_spend" &&
              "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
            reason === "high_average" &&
              "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
          )}
        >
          {FLAG_LABELS[reason]}
        </Badge>
      ))}
    </div>
  );
}

export function TopMerchantsCard({
  merchants,
  homeCurrency,
  className,
}: {
  merchants: TopMerchantSpend[];
  homeCurrency: SupportedCurrency;
  className?: string;
}) {
  const maxTotal = Math.max(1, ...merchants.map((merchant) => merchant.total));

  return (
    <Card className={className} data-testid="top-merchants-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Store className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Top spend merchants
        </CardTitle>
        <p className="text-xs font-normal text-muted-foreground">
          Wants-category merchants only; needs, bills, transfers, income and
          savings are excluded.
        </p>
      </CardHeader>
      <CardContent>
        {merchants.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No repeated wants merchants to flag for this period.
          </div>
        ) : (
          <div className="space-y-3">
            {merchants.map((merchant) => (
              <div
                key={`${merchant.merchant}-${merchant.total}-${merchant.count}`}
                className="rounded-md border bg-muted/20 p-3"
                data-testid="top-merchant-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {merchant.flagReasons.length > 0 && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      )}
                      <p className="truncate text-sm font-medium">
                        {merchant.merchant}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {merchant.categoryName ?? "Wants"} -{" "}
                      {merchant.shareOfWants.toFixed(1)}% of wants spend
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(merchant.total, homeCurrency)}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Repeat className="h-3 w-3" />
                      {merchant.count}x - avg{" "}
                      {formatCurrency(merchant.average, homeCurrency)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{
                        width: `${Math.max(8, (merchant.total / maxTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  <MerchantFlags reasons={merchant.flagReasons} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
