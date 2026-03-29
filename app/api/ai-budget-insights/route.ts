import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getScheduledAmountsByCategory,
} from "@/lib/budget/queries";
import { db } from "@/lib/db";
import { categories, settings } from "@/lib/db/schema";
import {
  isOpenAIReasoningChatModel,
  openAIModelOnlySupportsDefaultTemperature,
} from "@/lib/openai/model-params";
import { addCalendarMonths, formatCurrency, formatMonth } from "@/lib/utils";
import type { Category } from "@/types";

export async function POST(request: Request) {
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

  let month: string;
  try {
    const body = await request.json();
    month = body.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const allCats = db.select().from(categories).all() as Category[];
  const rows = buildBudgetCategoryRows(month, allCats);
  const { income } = getScheduledAmountsByCategory(month);
  const summary = buildBudgetSummary(rows, month, income);

  const budgetedRows = rows.filter((r) => r.targetAmount > 0);

  if (budgetedRows.length === 0) {
    return NextResponse.json({ insights: [] });
  }

  // Get previous month data for comparison
  const prevMonth = addCalendarMonths(month, -1);
  const prevRows = buildBudgetCategoryRows(prevMonth, allCats);

  const prevSpendMap = new Map(
    prevRows.map((r) => [r.categoryId, r.actualSpent]),
  );

  const today = new Date().toISOString().slice(0, 10);

  const categoryLines = budgetedRows
    .map((r) => {
      const pct =
        r.targetAmount > 0
          ? Math.round((r.actualSpent / r.targetAmount) * 100)
          : 0;
      const prevSpend = prevSpendMap.get(r.categoryId) ?? 0;
      return `- ${r.categoryName} (${r.parentName}): Target ${formatCurrency(r.targetAmount)}, Spent ${formatCurrency(r.actualSpent)} (${pct}%), Last month: ${formatCurrency(prevSpend)}, 3mo avg: ${formatCurrency(r.avg3Month)}, Scheduled recurring: ${formatCurrency(r.scheduledAmount)}`;
    })
    .join("\n");

  const prompt = `You are a friendly, insightful personal finance advisor. Analyse this monthly budget data and provide actionable insights.

Today: ${today}
Budget month: ${formatMonth(month)}
Days elapsed: ${summary.daysElapsed} of ${summary.daysInMonth} (${summary.daysRemaining} remaining)

Overall:
- Expected income: ${formatCurrency(summary.expectedIncome)}
- Total budgeted: ${formatCurrency(summary.totalBudgeted)}
- Total spent: ${formatCurrency(summary.totalSpent)} (${summary.totalBudgeted > 0 ? Math.round((summary.totalSpent / summary.totalBudgeted) * 100) : 0}%)
- Daily burn rate: ${formatCurrency(summary.dailyBurnRate)}/day (allowed: ${formatCurrency(summary.allowedDailyRate)}/day)
- Projected month-end spend: ${formatCurrency(summary.projectedSpend)}
- On track: ${summary.onTrack ? "Yes" : "No"}

Category breakdown:
${categoryLines}

Rules:
- Return 3-6 insights as JSON: {"insights": [{"type": "warning"|"suggestion"|"win", "category": "category name or null for general", "message": "concise actionable message"}]}
- "warning": categories trending over budget with projected overspend amounts
- "suggestion": specific, actionable advice like "Reduce dining out by $X this week to stay on track" or "Your grocery budget has room -- consider reallocating $X to utilities"
- "win": positive reinforcement for categories well under budget or improved vs last month
- Be specific with dollar amounts and timeframes
- Use encouraging, solution-oriented language (not "you overspent", but "to get back on track, try...")
- Compare to previous month where relevant
- If spending is very low early in the month, note it's too early for firm projections
- Only return the JSON object, no other text.`;

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
          : { temperature: 0.3 }),
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const insights = Array.isArray(parsed)
      ? parsed
      : (parsed.insights ?? []);

    return NextResponse.json({ insights });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 },
    );
  }
}
