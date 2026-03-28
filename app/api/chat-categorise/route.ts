import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { formatCategoryForAI } from "@/lib/categories/display-name";
import { db } from "@/lib/db";
import { accounts, settings, transactions } from "@/lib/db/schema";
import type { Category } from "@/types";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** OpenAI o-series and codex-mini use reasoning params; they reject `temperature` / `top_p`. */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/^o\d/.test(m)) return true;
  return m === "codex-mini-latest";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 },
    );
  }

  const aiEnabledSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai_enabled"))
    .get();
  if (aiEnabledSetting?.value !== "true") {
    return NextResponse.json(
      { error: "AI is disabled in settings" },
      { status: 503 },
    );
  }

  let body: {
    transactionId: number;
    messages: ChatMessage[];
    categories: Category[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { transactionId, messages, categories } = body;
  if (!transactionId || !Array.isArray(categories)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const txn = db
    .select({
      description: transactions.description,
      normalised: transactions.normalised,
      amount: transactions.amount,
      date: transactions.date,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.id, transactionId))
    .get();

  if (!txn) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 },
    );
  }

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();
  const model = modelSetting?.value ?? "gpt-4o-mini";

  const byId = new Map(categories.map((c) => [c.id, c]));
  const categoryList = categories
    .filter((c) => c.parentId != null && c.type !== "transfer")
    .map((c) => {
      const parent = c.parentId != null ? byId.get(c.parentId) : undefined;
      return formatCategoryForAI(c.id, c.name, parent?.name, c.type);
    })
    .join("\n");

  const systemPrompt = `You are a financial transaction categoriser. Help categorise one transaction at a time through a brief conversation.

Available categories:
${categoryList}

Transaction details:
- Description: "${txn.description}"
- Normalised: "${txn.normalised}"
- Amount: AUD ${txn.amount.toFixed(2)} (negative = expense)
- Date: ${txn.date}
- Account: ${txn.accountName}

Rules:
- If you are >80% confident, state your suggestion with ONE brief reason, then ask "Is that right?"
- If uncertain, ask ONE specific clarifying question (yes/no or short choice).
- Keep every response to 1-2 sentences max.
- When you have decided on a final category, end your message with exactly: CATEGORY:[id]
  Example: "Categorised as Groceries. CATEGORY:3"
- Do NOT include CATEGORY:[id] until you are ready to confirm the final answer.`;

  const client = new OpenAI({ apiKey });
  const reasoning = isReasoningModel(model);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
        // If no prior messages, ask AI to make its first suggestion
        ...(messages.length === 0
          ? [
              {
                role: "user" as const,
                content: "Please suggest a category for this transaction.",
              },
            ]
          : []),
      ],
      ...(reasoning
        ? { reasoning_effort: "low" as const }
        : { temperature: 0.3 }),
    });

    const reply = response.choices[0]?.message?.content ?? "";

    // Parse CATEGORY:[id] signal
    const match = reply.match(/CATEGORY:(\d+)/);
    const suggestedCategoryId = match ? parseInt(match[1], 10) : null;
    const isConfident = suggestedCategoryId !== null;

    const suggestedCategory = isConfident
      ? (categories.find((c) => c.id === suggestedCategoryId) ?? null)
      : null;

    // Strip the CATEGORY tag from the displayed reply
    const displayReply = reply.replace(/\s*CATEGORY:\d+/g, "").trim();

    return NextResponse.json({
      reply: displayReply,
      suggestedCategoryId,
      suggestedCategoryName: suggestedCategory?.name ?? null,
      isConfident,
    });
  } catch (err) {
    console.error("chat-categorise error:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
