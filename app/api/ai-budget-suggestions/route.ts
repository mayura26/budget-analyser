import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getBudgetTargetsForMonth,
  getHistoricalAverages,
  getMonthlySpendingByCategory,
  getScheduledAmountsByCategory,
} from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
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

  const homeCurrency = getHomeCurrency();
  const allCats = db.select().from(categories).all() as Category[];

  const monthlySpending = await getMonthlySpendingByCategory(
    month,
    homeCurrency,
    6,
  );
  const averages = await getHistoricalAverages(month, homeCurrency, 3);
  const { expenses: scheduled, income } = await getScheduledAmountsByCategory(
    month,
    homeCurrency,
  );

  const prevMonth = addCalendarMonths(month, -1);
  const prevTargets = getBudgetTargetsForMonth(prevMonth);
  const prevTargetMap = new Map(
    prevTargets.map((t) => [t.categoryId, t.targetAmount]),
  );

  const mainGroups = new Map(
    allCats.filter((c) => c.parentId === null).map((c) => [c.id, c.name]),
  );

  const expenseSubs = allCats.filter(
    (c) => c.parentId !== null && c.type === "expense",
  );

  // Only include categories that have some historical data or scheduled amounts
  const relevantCats = expenseSubs.filter(
    (c) =>
      monthlySpending.has(c.id) ||
      (averages.get(c.id) ?? 0) > 0 ||
      (scheduled.get(c.id) ?? 0) > 0,
  );

  if (relevantCats.length === 0) {
    return NextResponse.json({
      suggestions: [],
      overallNotes: "No spending history found to generate suggestions.",
    });
  }

  const categoryLines = relevantCats
    .map((cat) => {
      const parentName =
        cat.parentId != null
          ? (mainGroups.get(cat.parentId) ?? "Other")
          : "Other";
      const monthly = monthlySpending.get(cat.id) ?? [];
      const historyStr =
        monthly.length > 0
          ? monthly
              .map((m) => `${m.month}: ${formatCurrency(m.amount, homeCurrency)}`)
              .join(", ")
          : "no history";
      const avg = averages.get(cat.id) ?? 0;
      const sched = scheduled.get(cat.id) ?? 0;
      const prevTarget = prevTargetMap.get(cat.id);

      return `- [ID:${cat.id}] ${cat.name} (${parentName}): History=[${historyStr}], 3mo avg=${formatCurrency(avg, homeCurrency)}, Scheduled recurring=${formatCurrency(sched, homeCurrency)}${prevTarget ? `, Last month budget=${formatCurrency(prevTarget, homeCurrency)}` : ""}`;
    })
    .join("\n");

  const validIds = relevantCats.map((c) => c.id).join(", ");

  const prompt = `You are a smart personal finance advisor. Analyse the spending history below and suggest optimal budget targets for the upcoming month.

Target month: ${formatMonth(month)}
Expected monthly income: ${formatCurrency(income, homeCurrency)}
Currency: ${homeCurrency}

Category spending data (6-month history where available):
${categoryLines}

Rules:
- Return JSON: {"overallNotes": "1-2 sentence summary of budget strategy", "suggestions": [{"categoryId": <number>, "categoryName": "<name>", "suggestedAmount": <number>, "reasoning": "<1 sentence>", "trend": "increasing"|"decreasing"|"stable"|"new"}]}
- Only use category IDs from this list: [${validIds}]
- Round suggestedAmount to the nearest 10
- Consider spending trends: if a category is consistently increasing, budget slightly above the latest month
- Consider seasonality if patterns are visible (e.g. utilities higher in certain months)
- Factor in scheduled/recurring amounts as minimum floors
- If the previous month had a budget target, consider whether it was appropriate given actual spending
- The total budget should be realistic relative to income
- For categories with very little or sporadic spending, suggest conservative targets
- "trend" should reflect the spending direction over the available history
- Keep reasoning concise and specific (mention amounts or percentages)
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

    // Filter to only valid category IDs
    const validIdSet = new Set(relevantCats.map((c) => c.id));
    const suggestions = (parsed.suggestions ?? []).filter(
      (s: { categoryId: number }) => validIdSet.has(s.categoryId),
    );

    return NextResponse.json({
      suggestions,
      overallNotes: parsed.overallNotes ?? "",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}
