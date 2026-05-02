"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { BudgetRule502030Band, BudgetSummary } from "@/types";

function BandBar({
  label,
  guidelineLabel,
  band,
  homeCurrency,
}: {
  label: string;
  guidelineLabel: string;
  band: BudgetRule502030Band;
  homeCurrency: SupportedCurrency;
}) {
  const pctGuideline =
    band.guideline > 0
      ? Math.min(100, Math.round((band.actualTotal / band.guideline) * 100))
      : 0;
  const pctTarget =
    band.targetTotal > 0
      ? Math.min(100, Math.round((band.actualTotal / band.targetTotal) * 100))
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums text-xs">
          {guidelineLabel}: {formatCurrency(band.guideline, homeCurrency)}
        </span>
      </div>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>
          Actual {formatCurrency(band.actualTotal, homeCurrency)} vs target{" "}
          {formatCurrency(band.targetTotal, homeCurrency)}
        </span>
        <span>{pctGuideline}% of guideline</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex gap-0.5">
        <div
          className="h-full bg-primary/80 rounded-l-full transition-all"
          style={{ width: `${pctTarget}%` }}
          title="Actual vs category targets"
        />
      </div>
    </div>
  );
}

export function BudgetRule502030Strip({
  summary,
  homeCurrency,
}: {
  summary: BudgetSummary;
  homeCurrency: SupportedCurrency;
}) {
  const { rule502030: r, incomeBasis, expectedIncome } = summary;
  const basisNote =
    incomeBasis > expectedIncome
      ? "Uses max(scheduled income, realised income) for guideline percentages."
      : "Guidelines use scheduled income; realised income was lower this month.";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          50 / 30 / 20 guideline
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Income basis {formatCurrency(incomeBasis, homeCurrency)} &mdash;{" "}
          {basisNote}
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <BandBar
          label="Needs (~50%)"
          guidelineLabel="Guide"
          band={r.needs}
          homeCurrency={homeCurrency}
        />
        <BandBar
          label="Wants (~30%)"
          guidelineLabel="Guide"
          band={r.wants}
          homeCurrency={homeCurrency}
        />
        <BandBar
          label="Savings (~20%)"
          guidelineLabel="Guide"
          band={r.savings}
          homeCurrency={homeCurrency}
        />
      </CardContent>
    </Card>
  );
}
