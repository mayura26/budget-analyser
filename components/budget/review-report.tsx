"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { forwardRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopMerchantsCard } from "@/components/analytics/top-merchants-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency } from "@/lib/utils";
import type { TopMerchantSpend } from "@/types";

export type ReviewFormat = "digest" | "deep";
export type Bucket = "needs" | "wants" | "savings" | "overall";

export type BucketBand = {
  targetAmount: number;
  actualAmount: number;
  guidelineAmount: number;
  targetPct: number;
  actualPct: number;
};

export type ReviewMetrics = {
  month: string;
  monthLabel: string;
  totalBudgeted: number;
  totalSpent: number;
  projectedSpend: number;
  netVariance: number;
  onTrack: boolean;
  actualIncome: number;
  expectedIncome: number;
  incomeVariance: number;
  savingsRate: number;
  surplus: number;
  taggedSavings: number;
  effectiveSavings: number;
  buckets: { needs: BucketBand; wants: BucketBand; savings: BucketBand };
  topOverspend: {
    category: string;
    bucket: Bucket;
    amount: number;
    message: string;
  }[];
  topUnderspend: {
    category: string;
    bucket: Bucket;
    amount: number;
    message: string;
  }[];
  categoriesOverTarget: number;
  topWantsMerchants?: TopMerchantSpend[];
};

export type ListItemTag = { bucket: Bucket; text: string };
export type DigestRiskTag = {
  severity: "high" | "medium" | "low";
  bucket: Bucket;
  text: string;
};

export type DigestReview = {
  headline: string;
  bucketCommentary: { needs: string; wants: string; savings: string };
  risks: DigestRiskTag[];
  wins: ListItemTag[];
  actions: ListItemTag[];
};

export type DeepReview = {
  executiveSummary: string;
  narrative: string;
  bucketCommentary: { needs: string; wants: string; savings: string };
  keyFindings: ListItemTag[];
  varianceDrivers: ListItemTag[];
  recommendations: ListItemTag[];
};

export type ReviewPayload = {
  format: ReviewFormat;
  metrics: ReviewMetrics;
  review: DigestReview | DeepReview;
};

const BUCKET_THEME: Record<
  Bucket,
  { label: string; chip: string; bar: string; soft: string }
> = {
  needs: {
    label: "Needs",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    bar: "#0ea5e9",
    soft: "bg-sky-500/10",
  },
  wants: {
    label: "Wants",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    bar: "#f59e0b",
    soft: "bg-amber-500/10",
  },
  savings: {
    label: "Savings",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    bar: "#10b981",
    soft: "bg-emerald-500/10",
  },
  overall: {
    label: "Overall",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    bar: "#64748b",
    soft: "bg-slate-500/10",
  },
};

function BucketChip({ bucket }: { bucket: Bucket }) {
  const t = BUCKET_THEME[bucket];
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-[10px] uppercase tracking-wide font-medium",
        t.chip,
      )}
    >
      {t.label}
    </Badge>
  );
}

function bucketStatus(actualPct: number, targetPct: number) {
  const delta = actualPct - targetPct;
  if (Math.abs(delta) <= 2) return { label: "On target", tone: "ok" as const };
  if (delta > 0)
    return { label: `+${delta.toFixed(1)}% over`, tone: "over" as const };
  return { label: `${delta.toFixed(1)}% under`, tone: "under" as const };
}

/**
 * Savings inverts over/under sentiment: exceeding the savings target is a win,
 * falling short is the miss. Needs/wants keep the conventional over=bad mapping.
 */
function bucketSentiment(
  bucket: "needs" | "wants" | "savings",
  tone: "ok" | "over" | "under",
): "good" | "bad" | "ok" {
  if (tone === "ok") return "ok";
  if (bucket === "savings") return tone === "over" ? "good" : "bad";
  return tone === "over" ? "bad" : "good";
}

function HeroBand({
  metrics,
  homeCurrency,
  lead,
}: {
  metrics: ReviewMetrics;
  homeCurrency: SupportedCurrency;
  lead: string;
}) {
  const overBudget = metrics.netVariance > 0;
  const variancePrefix = overBudget ? "+" : "−";
  const varianceAbs = Math.abs(metrics.netVariance);
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-emerald-500/10 dark:from-indigo-500/15 dark:via-purple-500/10 dark:to-emerald-500/15">
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 sm:max-w-[60%]">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Monthly review
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {metrics.monthLabel}
            </h1>
            <p className="text-sm sm:text-base text-foreground/80 leading-relaxed">
              {lead}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 min-w-[180px]">
            <Badge
              variant={overBudget ? "destructive" : "default"}
              className="rounded-full px-3 py-1"
            >
              {overBudget ? "Over budget" : "On budget"}
            </Badge>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Net variance
              </div>
              <div
                className={cn(
                  "text-3xl sm:text-4xl font-semibold tabular-nums",
                  overBudget
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {variancePrefix}
                {formatCurrency(varianceAbs, homeCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Savings rate {metrics.savingsRate.toFixed(1)}% of actual income
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BucketVerdictCard({
  bucket,
  band,
  homeCurrency,
}: {
  bucket: "needs" | "wants" | "savings";
  band: BucketBand;
  homeCurrency: SupportedCurrency;
}) {
  const t = BUCKET_THEME[bucket];
  const status = bucketStatus(band.actualPct, band.targetPct);
  const sentiment = bucketSentiment(bucket, status.tone);
  const fillPct = Math.min(150, band.actualPct);
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
        t.soft,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t.label}
          </div>
          <div className="text-3xl font-semibold tabular-nums mt-1">
            {band.actualPct.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            target {band.targetPct}%
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            sentiment === "good" &&
              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
            sentiment === "bad" &&
              "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
            sentiment === "ok" &&
              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${(fillPct / 150) * 100}%`,
              backgroundColor: t.bar,
            }}
          />
          <div
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${(band.targetPct / 150) * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatCurrency(band.actualAmount, homeCurrency)}</span>
          <span>
            guide {formatCurrency(band.guidelineAmount, homeCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BucketCommentary({
  commentary,
}: {
  commentary: { needs: string; wants: string; savings: string };
}) {
  const items = (
    [
      { bucket: "needs", text: commentary.needs },
      { bucket: "wants", text: commentary.wants },
      { bucket: "savings", text: commentary.savings },
    ] as const
  ).filter((x) => x.text);
  if (!items.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const t = BUCKET_THEME[item.bucket];
        return (
          <div
            key={item.bucket}
            className={cn(
              "rounded-lg border p-3 text-sm leading-relaxed",
              t.soft,
            )}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: t.bar }}
                aria-hidden
              />
              <span className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                {t.label}
              </span>
            </div>
            <p>{item.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "p-1.5 rounded-md",
            tone === "good" &&
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            tone === "bad" && "bg-red-500/10 text-red-600 dark:text-red-400",
            tone === "default" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </div>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}

/** Y-axis label: leading segment before optional " (detail)" parenthetical. */
function leanCategoryLabel(fullName: string): string {
  const idx = fullName.indexOf("(");
  const lean = idx === -1 ? fullName : fullName.slice(0, idx).trim();
  return lean.length > 0 ? lean : fullName.trim();
}

type ChartRow = {
  name: string;
  fullName: string;
  variance: number;
  bucket: Bucket;
};

function VarianceChart({
  metrics,
  homeCurrency,
}: {
  metrics: ReviewMetrics;
  homeCurrency: SupportedCurrency;
}) {
  const rows: ChartRow[] = [
    ...metrics.topOverspend.map((r) => ({
      name: leanCategoryLabel(r.category),
      fullName: r.category,
      variance: r.amount,
      bucket: r.bucket,
    })),
    ...metrics.topUnderspend.map((r) => ({
      name: leanCategoryLabel(r.category),
      fullName: r.category,
      variance: -r.amount,
      bucket: r.bucket,
    })),
  ]
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 8);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Category variance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No category landed materially over or under target.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Category variance</CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Top movers, coloured by 50/30/20 bucket
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={240} minWidth={280}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                className="stroke-muted"
              />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatCurrency(v, homeCurrency)}
                className="text-xs"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={128}
                className="text-xs"
              />
              <Tooltip
                formatter={(value) => {
                  const v = typeof value === "number" ? value : 0;
                  return [
                    formatCurrency(Math.abs(v), homeCurrency),
                    v > 0 ? "Over" : "Under",
                  ];
                }}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.fullName ?? String(_label);
                }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
                {rows.map((row) => {
                  const baseColor = BUCKET_THEME[row.bucket].bar;
                  return (
                    <Cell
                      key={`${row.fullName}-${row.variance}`}
                      fill={row.variance > 0 ? baseColor : `${baseColor}99`}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({
  title,
  icon,
  accent,
  items,
  emptyText,
  renderRiskSeverity,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  items: ListItemTag[] | DigestRiskTag[];
  emptyText: string;
  renderRiskSeverity?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className={cn("rounded-md p-1.5", accent)}>{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item, idx) => {
              const text = item.text;
              const bucket = item.bucket;
              const severity = renderRiskSeverity
                ? (item as DigestRiskTag).severity
                : undefined;
              return (
                <li
                  key={`${title}-${idx}-${text.slice(0, 24)}`}
                  className="flex items-start gap-2 text-sm leading-relaxed"
                >
                  {severity ? (
                    <span
                      role="img"
                      aria-label={`${severity} severity`}
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        severity === "high" && "bg-red-500",
                        severity === "medium" && "bg-amber-500",
                        severity === "low" && "bg-sky-500",
                      )}
                    />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  )}
                  <span className="flex-1">{text}</span>
                  <BucketChip bucket={bucket} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export const ReviewReport = forwardRef<
  HTMLDivElement,
  { data: ReviewPayload; homeCurrency: SupportedCurrency }
>(function ReviewReport({ data, homeCurrency }, ref) {
  const lead =
    data.format === "digest" && "headline" in data.review
      ? data.review.headline
      : "executiveSummary" in data.review
        ? data.review.executiveSummary
        : "";
  const topWantsMerchants = data.metrics.topWantsMerchants ?? [];

  return (
    <div ref={ref} className="space-y-6 bg-background p-1">
      <HeroBand
        metrics={data.metrics}
        homeCurrency={homeCurrency}
        lead={lead}
      />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            50 / 30 / 20 verdict
          </h2>
          <span className="text-xs text-muted-foreground">
            Based on actual income{" "}
            {formatCurrency(data.metrics.actualIncome, homeCurrency)}
            {Math.abs(data.metrics.incomeVariance) > 0.01 && (
              <>
                {" "}
                ({data.metrics.incomeVariance >= 0 ? "+" : ""}
                {formatCurrency(data.metrics.incomeVariance, homeCurrency)} vs
                scheduled)
              </>
            )}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <BucketVerdictCard
            bucket="needs"
            band={data.metrics.buckets.needs}
            homeCurrency={homeCurrency}
          />
          <BucketVerdictCard
            bucket="wants"
            band={data.metrics.buckets.wants}
            homeCurrency={homeCurrency}
          />
          <BucketVerdictCard
            bucket="savings"
            band={data.metrics.buckets.savings}
            homeCurrency={homeCurrency}
          />
        </div>
      </div>

      <BucketCommentary commentary={data.review.bucketCommentary} />

      {data.format === "deep" &&
        "narrative" in data.review &&
        data.review.narrative && (
          <Card>
            <CardContent className="py-5">
              <p className="text-sm leading-relaxed">{data.review.narrative}</p>
            </CardContent>
          </Card>
        )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Budgeted"
          value={formatCurrency(data.metrics.totalBudgeted, homeCurrency)}
          icon={<Target className="h-4 w-4" />}
        />
        <MetricTile
          label="Spent"
          value={formatCurrency(data.metrics.totalSpent, homeCurrency)}
          hint={`${data.metrics.categoriesOverTarget} category${data.metrics.categoriesOverTarget === 1 ? "" : "ies"} over target`}
          icon={<Wallet className="h-4 w-4" />}
          tone={data.metrics.onTrack ? "good" : "bad"}
        />
        <MetricTile
          label={data.metrics.surplus > 0 ? "Surplus → savings" : "Overspent"}
          value={formatCurrency(
            data.metrics.surplus > 0
              ? data.metrics.surplus
              : Math.abs(data.metrics.netVariance),
            homeCurrency,
          )}
          hint={
            data.metrics.surplus > 0
              ? `On top of ${formatCurrency(data.metrics.taggedSavings, homeCurrency)} tagged`
              : "Spend exceeded budget"
          }
          icon={
            data.metrics.surplus > 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
          tone={data.metrics.surplus > 0 ? "good" : "bad"}
        />
        <MetricTile
          label="Effective savings"
          value={formatCurrency(data.metrics.effectiveSavings, homeCurrency)}
          hint={`${data.metrics.savingsRate.toFixed(1)}% of income`}
          icon={<Activity className="h-4 w-4" />}
          tone={data.metrics.savingsRate >= 20 ? "good" : "default"}
        />
      </div>

      <VarianceChart metrics={data.metrics} homeCurrency={homeCurrency} />

      {topWantsMerchants.length > 0 && (
        <TopMerchantsCard
          merchants={topWantsMerchants}
          homeCurrency={homeCurrency}
        />
      )}

      {data.format === "digest" && "headline" in data.review && (
        <div className="grid gap-3 md:grid-cols-3">
          <HighlightCard
            title="Wins"
            icon={<TrendingUp className="h-4 w-4" />}
            accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            items={data.review.wins}
            emptyText="No standout wins this month."
          />
          <HighlightCard
            title="Risks"
            icon={<AlertTriangle className="h-4 w-4" />}
            accent="bg-amber-500/15 text-amber-700 dark:text-amber-300"
            items={data.review.risks}
            emptyText="Nothing flagged as a risk."
            renderRiskSeverity
          />
          <HighlightCard
            title="Actions for next month"
            icon={<ArrowRight className="h-4 w-4" />}
            accent="bg-sky-500/15 text-sky-700 dark:text-sky-300"
            items={data.review.actions}
            emptyText="No specific actions called out."
          />
        </div>
      )}

      {data.format === "deep" && "executiveSummary" in data.review && (
        <div className="grid gap-3 md:grid-cols-3">
          <HighlightCard
            title="Key findings"
            icon={<Search className="h-4 w-4" />}
            accent="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
            items={data.review.keyFindings}
            emptyText="No key findings."
          />
          <HighlightCard
            title="Variance drivers"
            icon={<Activity className="h-4 w-4" />}
            accent="bg-amber-500/15 text-amber-700 dark:text-amber-300"
            items={data.review.varianceDrivers}
            emptyText="No notable variance drivers."
          />
          <HighlightCard
            title="Recommendations"
            icon={<ArrowRight className="h-4 w-4" />}
            accent="bg-sky-500/15 text-sky-700 dark:text-sky-300"
            items={data.review.recommendations}
            emptyText="No recommendations."
          />
        </div>
      )}
    </div>
  );
});

export function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
      </div>
      <div className="h-56 rounded-xl bg-muted/40 animate-pulse" />
    </div>
  );
}
