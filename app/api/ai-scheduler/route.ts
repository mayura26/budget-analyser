import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, settings, categories, scheduledTransactions } from "@/lib/db/schema";
import { eq, gte } from "drizzle-orm";
import OpenAI from "openai";

function isOpenAIReasoningChatModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/^o\d/.test(m)) return true;
  return m === "codex-mini-latest";
}

export async function POST() {
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

  if (!apiKeySetting?.value) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();

  const model = modelSetting?.value ?? "gpt-4o-mini";

  // Fetch last 6 months of non-transfer transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

  const allCategories = db.select().from(categories).all();
  const transferCategoryIds = new Set(
    allCategories.filter((c) => c.type === "transfer").map((c) => c.id)
  );
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

  const rawTxns = db
    .select()
    .from(transactions)
    .where(gte(transactions.date, cutoff))
    .all()
    .filter((t) => !t.categoryId || !transferCategoryIds.has(t.categoryId));

  // Group by normalised description
  const groups = new Map<
    string,
    { description: string; categoryId: number | null; amounts: number[]; dates: string[] }
  >();

  for (const txn of rawTxns) {
    const key = txn.normalised;
    if (!groups.has(key)) {
      groups.set(key, {
        description: txn.normalised,
        categoryId: txn.categoryId ?? null,
        amounts: [],
        dates: [],
      });
    }
    const g = groups.get(key)!;
    g.amounts.push(txn.amount);
    g.dates.push(txn.date);
    // Use most recent category
    if (txn.categoryId) g.categoryId = txn.categoryId;
  }

  // Filter to groups with 2+ occurrences, cap at 80
  const recurring = [...groups.values()]
    .filter((g) => g.dates.length >= 2)
    .slice(0, 80)
    .map((g) => {
      const sortedDates = [...g.dates].sort();
      const avgAmount = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
      const days = sortedDates.map((d) => parseInt(d.slice(8, 10)));
      const avgDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
      const category = g.categoryId ? categoryMap.get(g.categoryId) : null;
      return {
        description: g.description,
        categoryId: g.categoryId,
        categoryName: category?.name ?? null,
        occurrences: g.dates.length,
        avgAmount: Math.round(avgAmount * 100) / 100,
        dates: sortedDates,
        avgDayOfMonth: avgDay,
      };
    });

  if (recurring.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Fetch existing scheduled transaction names to avoid duplicates
  const existingSchedules = db.select().from(scheduledTransactions).all();
  const existingNames = existingSchedules.map((s) => s.name.toLowerCase());

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are a financial analyst. Analyse these grouped transaction patterns from the last 6 months and identify which ones are clearly recurring bills, subscriptions, or regular income.

Today's date: ${today}

Transaction groups (description | category | occurrences | avg_amount | dates | avg_day_of_month):
${recurring
  .map(
    (g) =>
      `- "${g.description}" | ${g.categoryName ?? "Uncategorised"} | ${g.occurrences}x | AUD ${g.avgAmount.toFixed(2)} | [${g.dates.join(", ")}] | avg day ${g.avgDayOfMonth}`
  )
  .join("\n")}

Already scheduled (skip these): ${existingNames.length > 0 ? existingNames.join(", ") : "none"}

Rules:
- Only return patterns you are highly confident (≥0.7) are recurring
- Use negative amounts for expenses, positive for income
- frequency: "weekly" (~7 days apart), "fortnightly" (~14 days), "monthly" (~30 days), "quarterly" (~90 days), "yearly" (~365 days)
- startDate: the next expected occurrence from today in YYYY-MM-DD format
- name: a clean, human-readable merchant name (not the raw bank description)
- Skip anything that looks like a one-off, transfer, or random purchase
- Skip anything already in the "Already scheduled" list

Respond with a JSON object: {"suggestions": [...]}
Each suggestion: {"name": string, "amount": number, "frequency": string, "startDate": string, "categoryId": number|null, "reasoning": string, "confidence": number}
Only return the JSON object, no other text.`;

  const client = new OpenAI({ apiKey: apiKeySetting.value });
  const reasoning = isOpenAIReasoningChatModel(model);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    ...(reasoning ? { reasoning_effort: "medium" as const } : { temperature: 0.1 }),
  });

  const content = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content);
    const suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? []);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
