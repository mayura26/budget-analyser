import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getScheduledAmountsByCategory,
  isMonthClosed,
} from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import { categories, settings } from "@/lib/db/schema";
import {
  isOpenAIReasoningChatModel,
  openAIModelOnlySupportsDefaultTemperature,
} from "@/lib/openai/model-params";
import { formatCurrency, formatMonth } from "@/lib/utils";
import type { Category } from "@/types";

type ReviewFormat = "digest" | "deep";

export async function POST(request: Request) {
  let month: string;
  let format: ReviewFormat;
  try {
    const body = await request.json();
    month = body.month;
    format = body.format === "deep" ? "deep" : "digest";
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

  const homeCurrency = getHomeCurrency();
  const allCats = db.select().from(categories).all() as Category[];
  const rows = await buildBudgetCategoryRows(month, allCats, homeCurrency);
  const { income } = await getScheduledAmountsByCategory(month, homeCurrency);
  const summary = buildBudgetSummary(rows, month, income);
  const budgetedRows = rows.filter((row) => row.targetAmount > 0);

  const rowStats = budgetedRows
    .map((row) => {
      const variance = row.actualSpent - row.targetAmount;
      return {
        categoryName: row.categoryName,
        parentName: row.parentName,
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
    .filter((row) => row.variance > 0)
    .slice(0, 3)
    .map((row) => ({
      category: row.categoryName,
      amount: Math.round(row.variance * 100) / 100,
      message: `${row.categoryName} is ${formatCurrency(row.variance, homeCurrency)} over target.`,
    }));

  const topUnderspend = rowStats
    .filter((row) => row.variance < 0)
    .slice(0, 3)
    .map((row) => ({
      category: row.categoryName,
      amount: Math.round(Math.abs(row.variance) * 100) / 100,
      message: `${row.categoryName} finished ${formatCurrency(Math.abs(row.variance), homeCurrency)} under target.`,
    }));

  const quickMetrics = {
    month,
    monthLabel: formatMonth(month),
    totalBudgeted: summary.totalBudgeted,
    totalSpent: summary.totalSpent,
    projectedSpend: summary.projectedSpend,
    netVariance: Math.round((summary.totalSpent - summary.totalBudgeted) * 100) / 100,
    onTrack: summary.totalSpent <= summary.totalBudgeted,
    topOverspend,
    topUnderspend,
  };

  const metricLines = rowStats
    .slice(0, 10)
    .map(
      (row) =>
        `- ${row.categoryName} (${row.parentName}): target ${formatCurrency(row.targetAmount, homeCurrency)}, spent ${formatCurrency(row.actualSpent, homeCurrency)}, variance ${formatCurrency(row.variance, homeCurrency)}, 3m avg ${formatCurrency(row.avg3Month, homeCurrency)}, scheduled ${formatCurrency(row.scheduledAmount, homeCurrency)}`,
    )
    .join("\n");

  const prompt =
    format === "digest"
      ? `You are a clear and practical personal finance coach. Produce quick monthly review JSON only.
Month: ${quickMetrics.monthLabel}
Total budgeted: ${formatCurrency(summary.totalBudgeted, homeCurrency)}
Total spent: ${formatCurrency(summary.totalSpent, homeCurrency)}
Net variance: ${formatCurrency(quickMetrics.netVariance, homeCurrency)}
Top category lines:
${metricLines}
Return JSON shape:
{"headline":"string","risks":["string"],"wins":["string"],"actions":["string"]}
Rules:
- 2-3 risks, 2-3 wins, 2-3 actions.
- Keep each item concise and specific.
- Mention exact category names and currency amounts where helpful.
- Output valid JSON only.`
      : `You are a personal finance analyst. Produce a detailed monthly review JSON only.
Month: ${quickMetrics.monthLabel}
Total budgeted: ${formatCurrency(summary.totalBudgeted, homeCurrency)}
Total spent: ${formatCurrency(summary.totalSpent, homeCurrency)}
Projected spend: ${formatCurrency(summary.projectedSpend, homeCurrency)}
Net variance: ${formatCurrency(quickMetrics.netVariance, homeCurrency)}
Category lines:
${metricLines}
Return JSON shape:
{"executiveSummary":"string","keyFindings":["string"],"varianceDrivers":["string"],"recommendations":["string"]}
Rules:
- keyFindings 3-5 bullets.
- varianceDrivers 3-5 bullets naming the strongest over/under categories.
- recommendations 3-5 concrete steps for next month.
- Output valid JSON only.`;

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

    if (format === "digest") {
      return NextResponse.json({
        format,
        metrics: quickMetrics,
        review: {
          headline:
            typeof parsed.headline === "string"
              ? parsed.headline
              : `You finished ${quickMetrics.monthLabel} ${quickMetrics.netVariance > 0 ? "over" : "under"} budget.`,
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          wins: Array.isArray(parsed.wins) ? parsed.wins : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        },
      });
    }

    return NextResponse.json({
      format,
      metrics: quickMetrics,
      review: {
        executiveSummary:
          typeof parsed.executiveSummary === "string"
            ? parsed.executiveSummary
            : `${quickMetrics.monthLabel} closed with ${formatCurrency(quickMetrics.netVariance, homeCurrency)} variance versus budget.`,
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
        varianceDrivers: Array.isArray(parsed.varianceDrivers)
          ? parsed.varianceDrivers
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : [],
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate budget review" },
      { status: 500 },
    );
  }
}
