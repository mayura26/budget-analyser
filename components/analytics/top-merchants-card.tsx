"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Repeat,
  Store,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency } from "@/lib/utils";
import type { TopMerchantSpend } from "@/types";

type MerchantSeverity = NonNullable<TopMerchantSpend["severity"]>;

const DEFAULT_VISIBLE_MERCHANTS = 2;

const FLAG_LABELS: Record<TopMerchantSpend["flagReasons"][number], string> = {
  frequent: "Frequent",
  high_spend: "High spend",
  high_average: "High avg",
  category_concentration: "Budget share",
};

const SEVERITY_META: Record<
  MerchantSeverity,
  {
    label: string;
    rowClass: string;
    badgeClass: string;
    barClass: string;
  }
> = {
  critical: {
    label: "Critical",
    rowClass:
      "border-red-500/30 bg-red-500/[0.06] shadow-sm dark:bg-red-500/[0.08]",
    badgeClass:
      "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    barClass: "bg-red-500",
  },
  medium: {
    label: "Medium",
    rowClass:
      "border-amber-500/25 bg-amber-500/[0.05] dark:bg-amber-500/[0.07]",
    badgeClass:
      "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    barClass: "bg-amber-500",
  },
  low: {
    label: "Low",
    rowClass: "border-border/80 bg-muted/20",
    badgeClass:
      "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    barClass: "bg-slate-400",
  },
};

function severityForMerchant(merchant: TopMerchantSpend): MerchantSeverity {
  if (merchant.severity) return merchant.severity;
  if (merchant.flagReasons.length >= 2) return "critical";
  if (merchant.flagReasons.length >= 1) return "medium";
  return "low";
}

function MerchantSignals({
  severity,
  reasons,
  compact = false,
}: {
  severity: MerchantSeverity;
  reasons: TopMerchantSpend["flagReasons"];
  compact?: boolean;
}) {
  const meta = SEVERITY_META[severity];
  const badgeSize = compact ? "px-1.5 py-0 text-[9px]" : "text-[10px]";

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Badge
        variant="outline"
        className={cn(
          "border font-medium uppercase tracking-wide",
          badgeSize,
          meta.badgeClass,
        )}
      >
        {meta.label}
      </Badge>
      {reasons.map((reason) => (
        <Badge
          key={reason}
          variant="outline"
          className={cn(
            "border font-medium uppercase tracking-wide",
            badgeSize,
            reason === "frequent" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            reason === "high_spend" &&
              "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
            reason === "high_average" &&
              "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            reason === "category_concentration" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
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
  const [expanded, setExpanded] = useState(false);
  const maxTotal = Math.max(1, ...merchants.map((merchant) => merchant.total));
  const hasHiddenMerchants = merchants.length > DEFAULT_VISIBLE_MERCHANTS;
  const visibleMerchants = expanded
    ? merchants
    : merchants.slice(0, DEFAULT_VISIBLE_MERCHANTS);
  const hiddenCount = Math.max(0, merchants.length - visibleMerchants.length);
  const severityCounts = merchants.reduce(
    (counts, merchant) => {
      counts[severityForMerchant(merchant)] += 1;
      return counts;
    },
    { critical: 0, medium: 0, low: 0 } satisfies Record<
      MerchantSeverity,
      number
    >,
  );

  return (
    <Card className={className} data-testid="top-merchants-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Store className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Merchant signals
            </CardTitle>
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              Wants-category merchants ranked by repeat activity, average size
              and budget concentration.
            </p>
          </div>
          {merchants.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {(["critical", "medium", "low"] as const).map((severity) => (
                <Badge
                  key={severity}
                  variant="outline"
                  className={cn(
                    "border text-[10px] font-medium uppercase tracking-wide",
                    SEVERITY_META[severity].badgeClass,
                    severityCounts[severity] === 0 && "hidden",
                  )}
                >
                  {severityCounts[severity]} {SEVERITY_META[severity].label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {merchants.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No wants merchants to flag for this period.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleMerchants.map((merchant) => {
              const severity = severityForMerchant(merchant);
              const meta = SEVERITY_META[severity];
              const isCritical = severity === "critical";
              const isMedium = severity === "medium";
              const isLow = severity === "low";
              const isCompact = !isCritical;

              return (
                <div
                  key={`${merchant.merchant}-${merchant.total}-${merchant.count}`}
                  className={cn(
                    "rounded-md border transition-colors",
                    meta.rowClass,
                    isCritical && "p-3",
                    isMedium && "p-2",
                    isLow && "px-2 py-1.5",
                  )}
                  data-severity={severity}
                  data-testid="top-merchant-row"
                >
                  <div
                    className={cn(
                      "flex justify-between gap-3",
                      isCompact ? "items-center" : "items-start",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {isCritical && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        <p
                          className={cn(
                            "truncate font-medium",
                            isCritical && "text-sm",
                            isMedium && "text-xs",
                            isLow && "text-[11px]",
                          )}
                        >
                          {merchant.merchant}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-muted-foreground",
                          isCritical && "text-xs",
                          isCompact && "text-[11px]",
                        )}
                      >
                        {merchant.categoryName ?? "Wants"} -{" "}
                        {merchant.shareOfCategory.toFixed(1)}% of category
                        budget, {merchant.shareOfWants.toFixed(1)}% of wants
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "font-semibold tabular-nums",
                          isCritical && "text-sm",
                          isMedium && "text-xs",
                          isLow && "text-[11px]",
                        )}
                      >
                        {formatCurrency(merchant.total, homeCurrency)}
                      </div>
                      <div
                        className={cn(
                          "flex items-center justify-end gap-1 text-muted-foreground",
                          isCritical && "text-xs",
                          isCompact && "text-[11px]",
                        )}
                      >
                        <Repeat className="h-3 w-3" />
                        {merchant.count}x - avg{" "}
                        {formatCurrency(merchant.average, homeCurrency)}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-3",
                      isCritical && "mt-3",
                      isMedium && "mt-1.5",
                      isLow && "mt-1 justify-end",
                    )}
                  >
                    {!isLow && (
                      <div
                        className={cn(
                          "min-w-0 flex-1 overflow-hidden rounded-full bg-muted",
                          isCritical ? "h-2" : "h-1.5",
                        )}
                      >
                        <div
                          className={cn("h-full rounded-full", meta.barClass)}
                          style={{
                            width: `${Math.max(8, (merchant.total / maxTotal) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <MerchantSignals
                      severity={severity}
                      reasons={merchant.flagReasons}
                      compact={isCompact}
                    />
                  </div>
                </div>
              );
            })}
            {hasHiddenMerchants && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((current) => !current)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show {hiddenCount} more
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
