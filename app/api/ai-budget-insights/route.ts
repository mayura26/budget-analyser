import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildParentGroupLine } from "@/lib/budget/insights-context";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getActualIncomeForMonth,
  getRemainingScheduledByCategory,
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
  const rows = await buildBudgetCategoryRows(month, allCats, homeCurrency);
  const { income } = await getScheduledAmountsByCategory(month, homeCurrency);
  const actualIncome = await getActualIncomeForMonth(month, homeCurrency);
  const scheduledRemaining = await getRemainingScheduledByCategory(
    month,
    homeCurrency,
  );
  const summary = buildBudgetSummary(
    rows,
    month,
    income,
    actualIncome,
    isMonthClosed(month),
    scheduledRemaining,
  );

  const budgetedRows = rows.filter((r) => r.targetAmount > 0);

  if (budgetedRows.length === 0) {
    return NextResponse.json({ insights: [] });
  }

  // Get previous month data for comparison
  const prevMonth = addCalendarMonths(month, -1);
  const prevRows = await buildBudgetCategoryRows(
    prevMonth,
    allCats,
    homeCurrency,
  );

  const prevSpendMap = new Map(
    prevRows.map((r) => [r.categoryId, r.actualSpent]),
  );

  const today = new Date().toISOString().slice(0, 10);

  // Group subcategory rows by parent group for higher-level analysis
  const parentGroups = new Map<
    string,
    {
      rows: (typeof budgetedRows)[0][];
      prevSpend: number;
      schedRemaining: number;
    }
  >();
  for (const r of budgetedRows) {
    if (!parentGroups.has(r.parentName)) {
      parentGroups.set(r.parentName, {
        rows: [],
        prevSpend: 0,
        schedRemaining: 0,
      });
    }
    const g = parentGroups.get(r.parentName)!;
    g.rows.push(r);
    g.prevSpend += prevSpendMap.get(r.categoryId) ?? 0;
    g.schedRemaining += scheduledRemaining.get(r.categoryId) ?? 0;
  }

  const parentGroupLines = Array.from(parentGroups.entries())
    .map(([parentName, { rows, prevSpend, schedRemaining }]) =>
      buildParentGroupLine(
        { parentName, rows, prevSpend, schedRemaining },
        homeCurrency,
      ),
    )
    .join("\n");

  const prompt = `You are a friendly, insightful personal finance advisor. Analyse this monthly budget data and provide exactly 3 distilled insights.

Today: ${today}
Budget month: ${formatMonth(month)}
Days elapsed: ${summary.daysElapsed} of ${summary.daysInMonth} (${summary.daysRemaining} remaining)

Overall:
- Expected income: ${formatCurrency(summary.expectedIncome, homeCurrency)}
- Total budgeted: ${formatCurrency(summary.totalBudgeted, homeCurrency)}
- Total spent: ${formatCurrency(summary.totalSpent, homeCurrency)} (${summary.totalBudgeted > 0 ? Math.round((summary.totalSpent / summary.totalBudgeted) * 100) : 0}%)
- Daily burn rate: ${formatCurrency(summary.dailyBurnRate, homeCurrency)}/day (allowed: ${formatCurrency(summary.allowedDailyRate, homeCurrency)}/day)
- Scheduled bills still due this month: ${formatCurrency(summary.scheduledRemaining, homeCurrency)}
- Projected month-end spend: ${formatCurrency(summary.projectedSpend, homeCurrency)} (already includes scheduled bills still due)
- On track: ${summary.onTrack ? "Yes" : "No"}

Spending by category group (subcategories shown as context):
${parentGroupLines}

Rules:
- Return EXACTLY 3 insights as JSON: {"insights": [{"type": "warning"|"suggestion"|"win", "category": "parent group name or null for general", "message": "concise actionable message"}]}
- Insight 1: overall status — type "win" if on track overall, "warning" if over budget overall
- Insights 2–3: the two most notable parent-group-level findings, chosen from:
  - "warning": an expense/needs/wants parent group that is NET over budget (even if driven by one subcategory)
  - "win": a parent group that is meaningfully under budget or improved vs last month
  - "suggestion": a parent group with an interesting internal shift (e.g., more dining, less shopping — net balanced) worth noting
- CRITICAL — savings are INVERSE of spending: a parent group marked "(savings ...)" measures money saved/invested against a savings PLAN. Exceeding the savings target is a WIN (the user saved/invested more than planned) — NEVER classify a savings group over its target as a "warning" or "over budget". For savings, the only concern is falling SHORT of the plan.
- Savings is EXCLUDED from the overall spend totals and on-track figure above, so an over-target savings group does NOT eat into the overall buffer — never frame it as overspending.
- CRITICAL: do NOT flag a subcategory overspend if its parent group is net on-track or under budget — internal shifts within a balanced group are not warnings
- Use the parent group name in the "category" field (e.g., "Enjoyment", "Special")
- Quote net group dollar amounts; only mention a specific subcategory if it is the sole driver of a group-level issue
- Be specific with dollar amounts; use encouraging, solution-oriented language
- Account for scheduled bills not yet paid: do NOT call a group "under budget" (or treat spent-so-far as final) when large scheduled payments are still due this month — judge on-track status from the schedule-aware Projected figures, not raw spending so far
- If discretionary spending is genuinely low with few bills left to come, it's fine to note a positive buffer; only caveat that it's early if meaningful spend or scheduled bills remain
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
    const insights = Array.isArray(parsed) ? parsed : (parsed.insights ?? []);

    return NextResponse.json({ insights });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 },
    );
  }
}
