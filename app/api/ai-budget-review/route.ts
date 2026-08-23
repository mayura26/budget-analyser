import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getTopWantsMerchantsForRange } from "@/lib/analytics/queries";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getActualIncomeForMonth,
  getMonthReview,
  getScheduledAmountsByCategory,
  isMonthClosed,
  saveMonthReview,
} from "@/lib/budget/queries";
import {
  calculateReviewSavingsMetrics,
  reviewSavingsMetricsMatch,
} from "@/lib/budget/review-savings";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { categories, settings } from "@/lib/db/schema";
import {
  isOpenAIReasoningChatModel,
  openAIModelOnlySupportsDefaultTemperature,
} from "@/lib/openai/model-params";
import { formatCurrency, formatMonth, getMonthRange } from "@/lib/utils";
import type { Category, TopMerchantSpend } from "@/types";

type ReviewFormat = "digest" | "deep";
type Bucket = "needs" | "wants" | "savings" | "overall";

type BucketBand = {
  targetAmount: number;
  actualAmount: number;
  guidelineAmount: number;
  targetPct: number;
  actualPct: number;
};

type ReviewMetrics = {
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

type DigestRiskTag = {
  severity: "high" | "medium" | "low";
  bucket: Bucket;
  text: string;
};
type ListItemTag = { bucket: Bucket; text: string };

type DigestReview = {
  headline: string;
  bucketCommentary: { needs: string; wants: string; savings: string };
  risks: DigestRiskTag[];
  wins: ListItemTag[];
  actions: ListItemTag[];
};

type DeepReview = {
  executiveSummary: string;
  narrative: string;
  bucketCommentary: { needs: string; wants: string; savings: string };
  keyFindings: ListItemTag[];
  varianceDrivers: ListItemTag[];
  recommendations: ListItemTag[];
};

function pctOf(value: number, basis: number): number {
  if (basis <= 0) return 0;
  return Math.round((value / basis) * 1000) / 10;
}

function asBucket(raw: unknown): Bucket {
  if (raw === "needs" || raw === "wants" || raw === "savings") return raw;
  return "overall";
}

function asListItems(raw: unknown): ListItemTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string")
        return { bucket: "overall" as Bucket, text: item };
      if (item && typeof item === "object") {
        const text =
          typeof (item as { text?: unknown }).text === "string"
            ? (item as { text: string }).text
            : "";
        if (!text) return null;
        return {
          bucket: asBucket((item as { bucket?: unknown }).bucket),
          text,
        };
      }
      return null;
    })
    .filter((x): x is ListItemTag => x !== null);
}

function asRiskItems(raw: unknown): DigestRiskTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return {
          severity: "medium" as const,
          bucket: "overall" as Bucket,
          text: item,
        };
      }
      if (item && typeof item === "object") {
        const text =
          typeof (item as { text?: unknown }).text === "string"
            ? (item as { text: string }).text
            : "";
        if (!text) return null;
        const sev = (item as { severity?: unknown }).severity;
        const severity =
          sev === "high" || sev === "low" ? sev : ("medium" as const);
        return {
          severity,
          bucket: asBucket((item as { bucket?: unknown }).bucket),
          text,
        };
      }
      return null;
    })
    .filter((x): x is DigestRiskTag => x !== null);
}

function asBucketCommentary(raw: unknown): {
  needs: string;
  wants: string;
  savings: string;
} {
  const out = { needs: "", wants: "", savings: "" };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.needs === "string") out.needs = r.needs;
    if (typeof r.wants === "string") out.wants = r.wants;
    if (typeof r.savings === "string") out.savings = r.savings;
  }
  return out;
}

function hasCurrentSavingsMath(metrics: ReviewMetrics): boolean {
  const values = [
    metrics.actualIncome,
    metrics.totalSpent,
    metrics.taggedSavings,
    metrics.surplus,
    metrics.effectiveSavings,
    metrics.savingsRate,
  ];
  if (!values.every(Number.isFinite)) return false;

  const expected = calculateReviewSavingsMetrics({
    actualIncome: metrics.actualIncome,
    totalSpent: metrics.totalSpent,
    taggedSavings: metrics.taggedSavings,
  });

  return reviewSavingsMetricsMatch(
    {
      taggedSavings: metrics.taggedSavings,
      surplus: metrics.surplus,
      effectiveSavings: metrics.effectiveSavings,
      savingsRate: metrics.savingsRate,
    },
    expected,
  );
}

export async function POST(request: Request) {
  let month: string;
  let format: ReviewFormat;
  let regenerate = false;
  try {
    const body = await request.json();
    month = body.month;
    format = body.format === "deep" ? "deep" : "digest";
    regenerate = Boolean(body.regenerate);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  if (!isMonthClosed(month)) {
    return NextResponse.json(
      { error: "Month must be closed before running a review" },
      { status: 400 },
    );
  }

  const homeCurrency = getHomeCurrency();
  const { start, end } = getMonthRange(month);

  if (!regenerate) {
    const cached = getMonthReview<DigestReview | DeepReview, ReviewMetrics>(
      month,
      format,
    );
    if (cached && hasCurrentSavingsMath(cached.metrics)) {
      const topWantsMerchants =
        cached.metrics.topWantsMerchants ??
        (await getTopWantsMerchantsForRange(start, end, homeCurrency));
      return NextResponse.json({
        format,
        metrics: { ...cached.metrics, topWantsMerchants },
        review: cached.review,
        cached: true,
        model: cached.model,
        generatedAt: cached.generatedAt,
      });
    }
  }

  const aiEnabledSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai_enabled"))
    .get();
  if (aiEnabledSetting?.value !== "true") {
    return NextResponse.json({ error: "AI not enabled" }, { status: 400 });
  }

  const apiKeySetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_api_key"))
    .get();
  const apiKey = process.env.OPENAI_API_KEY ?? apiKeySetting?.value;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured" },
      { status: 400 },
    );
  }

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();
  const model = modelSetting?.value ?? "gpt-4o-mini";

  const allCats = db.select().from(categories).all() as Category[];
  const rows = await buildBudgetCategoryRows(month, allCats, homeCurrency);
  const { income: scheduledIncome } = await getScheduledAmountsByCategory(
    month,
    homeCurrency,
  );
  const actualIncome = await getActualIncomeForMonth(month, homeCurrency);
  const summary = buildBudgetSummary(
    rows,
    month,
    scheduledIncome,
    actualIncome,
    true, // month is closed; force surplus → savings rollup
  );

  const budgetedRows = rows.filter((row) => row.targetAmount > 0);

  const rowStats = budgetedRows
    .map((row) => {
      const variance = row.actualSpent - row.targetAmount;
      return {
        categoryName: row.categoryName,
        parentName: row.parentName,
        bucket: (row.ruleBucket ?? "overall") as Bucket,
        targetAmount: row.targetAmount,
        actualSpent: row.actualSpent,
        avg3Month: row.avg3Month,
        scheduledAmount: row.scheduledAmount,
        variance,
        variancePct:
          row.targetAmount > 0 ? (variance / row.targetAmount) * 100 : 0,
      };
    })
    .sort((a, b) => b.variance - a.variance);

  const topOverspend = rowStats
    .filter((r) => r.variance > 0)
    .slice(0, 3)
    .map((r) => ({
      category: r.categoryName,
      bucket: r.bucket,
      amount: Math.round(r.variance * 100) / 100,
      message: `${r.categoryName} is ${formatCurrency(r.variance, homeCurrency)} over target.`,
    }));

  const topUnderspend = rowStats
    .filter((r) => r.variance < 0)
    .slice(0, 3)
    .map((r) => ({
      category: r.categoryName,
      bucket: r.bucket,
      amount: Math.round(Math.abs(r.variance) * 100) / 100,
      message: `${r.categoryName} finished ${formatCurrency(Math.abs(r.variance), homeCurrency)} under target.`,
    }));

  // Use ACTUAL income as the basis for the review (not scheduled).
  const incomeForReview = actualIncome;
  const { surplus, taggedSavings, effectiveSavings, savingsRate } =
    calculateReviewSavingsMetrics({
      actualIncome: incomeForReview,
      totalSpent: summary.totalSpent,
      taggedSavings: summary.totalSavingsAllocated,
    });

  const needsBand = summary.rule502030.needs;
  const wantsBand = summary.rule502030.wants;
  const savingsBand = summary.rule502030.savings; // already includes surplus when monthClosed

  const buckets: ReviewMetrics["buckets"] = {
    needs: {
      targetAmount: needsBand.targetTotal,
      actualAmount: needsBand.actualTotal,
      guidelineAmount: needsBand.guideline,
      targetPct: 50,
      actualPct: pctOf(needsBand.actualTotal, incomeForReview),
    },
    wants: {
      targetAmount: wantsBand.targetTotal,
      actualAmount: wantsBand.actualTotal,
      guidelineAmount: wantsBand.guideline,
      targetPct: 30,
      actualPct: pctOf(wantsBand.actualTotal, incomeForReview),
    },
    savings: {
      targetAmount: savingsBand.targetTotal,
      actualAmount: savingsBand.actualTotal,
      guidelineAmount: savingsBand.guideline,
      targetPct: 20,
      actualPct: pctOf(savingsBand.actualTotal, incomeForReview),
    },
  };

  const incomeVariance =
    Math.round((actualIncome - scheduledIncome) * 100) / 100;
  const topWantsMerchants = await getTopWantsMerchantsForRange(
    start,
    end,
    homeCurrency,
  );

  const metrics: ReviewMetrics = {
    month,
    monthLabel: formatMonth(month),
    totalBudgeted: summary.totalBudgeted,
    totalSpent: summary.totalSpent,
    projectedSpend: summary.projectedSpend,
    netVariance:
      Math.round((summary.totalSpent - summary.totalBudgeted) * 100) / 100,
    onTrack: summary.totalSpent <= summary.totalBudgeted,
    actualIncome,
    expectedIncome: summary.expectedIncome,
    incomeVariance,
    savingsRate,
    surplus,
    taggedSavings,
    effectiveSavings,
    buckets,
    topOverspend,
    topUnderspend,
    categoriesOverTarget: rowStats.filter((r) => r.variance > 0).length,
    topWantsMerchants,
  };

  const metricLines = rowStats
    .slice(0, 12)
    .map(
      (r) =>
        `- ${r.categoryName} [${r.bucket}] (${r.parentName}): target ${formatCurrency(r.targetAmount, homeCurrency)}, spent ${formatCurrency(r.actualSpent, homeCurrency)}, variance ${formatCurrency(r.variance, homeCurrency)}, 3m avg ${formatCurrency(r.avg3Month, homeCurrency)}`,
    )
    .join("\n");

  const merchantLines = topWantsMerchants.length
    ? topWantsMerchants
        .map((merchant) => {
          const flags = merchant.flagReasons.length
            ? merchant.flagReasons.join(", ")
            : "repeat_activity";
          return `- ${merchant.merchant}: ${merchant.severity ?? "low"} severity, ${merchant.count} transactions, total ${formatCurrency(merchant.total, homeCurrency)}, average ${formatCurrency(merchant.average, homeCurrency)}, ${merchant.shareOfCategory}% of its category budget, ${merchant.shareOfWants}% of wants spend, category ${merchant.categoryName ?? "Wants"}, signals ${flags}`;
        })
        .join("\n")
    : "- No wants merchant signals.";

  const bucketLines = (
    [
      ["Needs (50%)", buckets.needs],
      ["Wants (30%)", buckets.wants],
      ["Savings (20%)", buckets.savings],
    ] as const
  )
    .map(
      ([label, b]) =>
        `- ${label}: target ${formatCurrency(b.targetAmount, homeCurrency)}, actual ${formatCurrency(b.actualAmount, homeCurrency)} (${b.actualPct}% of actual income vs ${b.targetPct}% guideline of ${formatCurrency(b.guidelineAmount, homeCurrency)})`,
    )
    .join("\n");

  const sharedContext = `Month: ${metrics.monthLabel}
Actual income: ${formatCurrency(actualIncome, homeCurrency)}
Expected income (scheduled): ${formatCurrency(summary.expectedIncome, homeCurrency)} (variance ${formatCurrency(incomeVariance, homeCurrency)})
Total spent: ${formatCurrency(summary.totalSpent, homeCurrency)}
Total budgeted: ${formatCurrency(summary.totalBudgeted, homeCurrency)}
Net variance vs budget: ${formatCurrency(metrics.netVariance, homeCurrency)}
Surplus rolled into savings: ${formatCurrency(surplus, homeCurrency)}
Tagged savings spend: ${formatCurrency(taggedSavings, homeCurrency)}
Effective savings (tagged savings + true surplus): ${formatCurrency(effectiveSavings, homeCurrency)} (${savingsRate}% of actual income)

50/30/20 breakdown (% based on actual income):
${bucketLines}

Top category lines:
${metricLines}

Top wants merchant concentration (needs, scheduled calendar payments, transfers, income and savings excluded):
${merchantLines}`;

  const sharedRules = `Rules:
- Frame the review as a 50/30/20 review. Treat only leftover surplus after expenses and tagged savings as additional effective savings.
- Use ACTUAL income, not scheduled, for percentages. If actual differed materially from scheduled, call that out as its own point.
- Every list item must be an object: { "bucket": "needs"|"wants"|"savings"|"overall", "text": "..." }.
- Every recommendation/risk/action must name at least one specific category or wants merchant and a dollar amount, and tie back to the bucket's target percentage.
- bucketCommentary must be ONE concise sentence per bucket explaining where it landed and why.
- Output valid JSON only. No prose, no markdown.`;

  const prompt =
    format === "digest"
      ? `You are a personal finance coach reviewing whether the user lived their 50/30/20 plan this month. Produce a quick monthly digest as JSON only.
${sharedContext}

Return JSON shape:
{
  "headline": "string (one sentence verdict)",
  "bucketCommentary": { "needs": "string", "wants": "string", "savings": "string" },
  "risks": [{ "severity": "high"|"medium"|"low", "bucket": "needs"|"wants"|"savings"|"overall", "text": "string" }],
  "wins": [{ "bucket": "needs"|"wants"|"savings"|"overall", "text": "string" }],
  "actions": [{ "bucket": "needs"|"wants"|"savings"|"overall", "text": "string" }]
}

Counts: 2-3 risks, 2-3 wins, 2-3 actions.
${sharedRules}`
      : `You are a personal finance analyst reviewing whether the user lived their 50/30/20 plan this month. Produce a detailed monthly review as JSON only.
${sharedContext}

Return JSON shape:
{
  "executiveSummary": "string (1-2 sentences)",
  "narrative": "string (3-5 sentences leading with the 50/30/20 verdict)",
  "bucketCommentary": { "needs": "string", "wants": "string", "savings": "string" },
  "keyFindings": [{ "bucket": "...", "text": "string" }],
  "varianceDrivers": [{ "bucket": "...", "text": "string" }],
  "recommendations": [{ "bucket": "...", "text": "string" }]
}

Counts: 3-5 keyFindings, 3-5 varianceDrivers, 3-5 recommendations.
${sharedRules}`;

  const client = new OpenAI({ apiKey });
  const reasoning = isOpenAIReasoningChatModel(model);
  const defaultTempOnly = openAIModelOnlySupportsDefaultTemperature(model);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      ...(reasoning
        ? { reasoning_effort: "medium" as const }
        : defaultTempOnly
          ? {}
          : { temperature: 0.2 }),
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);

    const review: DigestReview | DeepReview =
      format === "digest"
        ? {
            headline:
              typeof parsed.headline === "string"
                ? parsed.headline
                : `You finished ${metrics.monthLabel} ${metrics.netVariance > 0 ? "over" : "under"} budget.`,
            bucketCommentary: asBucketCommentary(parsed.bucketCommentary),
            risks: asRiskItems(parsed.risks),
            wins: asListItems(parsed.wins),
            actions: asListItems(parsed.actions),
          }
        : {
            executiveSummary:
              typeof parsed.executiveSummary === "string"
                ? parsed.executiveSummary
                : `${metrics.monthLabel} closed with ${formatCurrency(metrics.netVariance, homeCurrency)} variance versus budget.`,
            narrative:
              typeof parsed.narrative === "string" ? parsed.narrative : "",
            bucketCommentary: asBucketCommentary(parsed.bucketCommentary),
            keyFindings: asListItems(parsed.keyFindings),
            varianceDrivers: asListItems(parsed.varianceDrivers),
            recommendations: asListItems(parsed.recommendations),
          };

    const generatedAt = saveMonthReview({
      month,
      format,
      review,
      metrics,
      model,
    });

    return NextResponse.json({
      format,
      metrics,
      review,
      cached: false,
      model,
      generatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate budget review" },
      { status: 500 },
    );
  }
}
