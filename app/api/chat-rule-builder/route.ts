import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { formatCategoryForAI } from "@/lib/categories/display-name";
import {
  extractProposedRulesFromAssistantContent,
  truncateForPrompt,
} from "@/lib/categorisation/rule-builder-chat";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import {
  isOpenAIReasoningChatModel,
  openAIModelOnlySupportsDefaultTemperature,
} from "@/lib/openai/model-params";
import type { Category, RuleDraftInput } from "@/types";

type ChatMessage = { role: "user" | "assistant"; content: string };

type TransactionSample = {
  id: number;
  date: string;
  description: string;
  normalised: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  accountName?: string;
};

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
    messages: ChatMessage[];
    categories: Category[];
    transactions: TransactionSample[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { messages, categories, transactions: txSample } = body;
  if (!Array.isArray(categories) || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const sample = Array.isArray(txSample) ? txSample : [];

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();
  const model = modelSetting?.value ?? "gpt-4o-mini";

  const byId = new Map(categories.map((c) => [c.id, c]));
  const categoryList = categories
    .filter((c) => c.parentId != null)
    .map((c) => {
      const parent = c.parentId != null ? byId.get(c.parentId) : undefined;
      return formatCategoryForAI(c.id, c.name, parent?.name, c.type);
    })
    .join("\n");

  const transactionLines = sample
    .map((t) => {
      const norm = truncateForPrompt(t.normalised);
      const cat =
        t.categoryName != null && t.categoryName !== ""
          ? `current_cat: ${t.categoryName} (id ${t.categoryId ?? "—"})`
          : "current_cat: none";
      return `id=${t.id} | ${t.date} | "${norm}" | AUD ${t.amount.toFixed(2)} | ${cat}`;
    })
    .join("\n");

  const systemPrompt = `You help users build categorisation rules for bank transactions. Rules match the **normalised** description text (uppercase, simplified).

Available sub-categories (use categoryId when proposing rules):
${categoryList}

Transaction sample (ground truth for patterns — prefer keywords that appear in normalised text):
${transactionLines || "(no rows loaded)"}

Instructions:
- Prefer **keyword** rules: a substring that appears in normalised text (case-insensitive).
- Use **exact** only for a full-string match; use **regex** sparingly for patterns like multiple merchants; keep regex simple and safe.
- Map user intent to the best sub-category id from the list above.
- Reply conversationally in plain text. When you propose concrete rules the user can save, add a JSON code block AFTER your explanation with this exact shape:
\`\`\`json
{"proposedRules":[{"categoryId":123,"pattern":"MESSINA","patternType":"keyword","rationale":"optional"}]}
\`\`\`
patternType must be one of: keyword, regex, exact.
- If you are only clarifying or asking questions, omit the JSON block.
- Do not invent category ids; only use ids from the list above.`;

  const client = new OpenAI({ apiKey });
  const reasoning = isOpenAIReasoningChatModel(model);
  const defaultTempOnly = openAIModelOnlySupportsDefaultTemperature(model);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      ...(reasoning
        ? { reasoning_effort: "low" as const }
        : defaultTempOnly
          ? {}
          : { temperature: 0.3 }),
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const { displayReply, proposedRules } =
      extractProposedRulesFromAssistantContent(raw);

    const validated: RuleDraftInput[] = proposedRules;

    return NextResponse.json({
      reply: displayReply || raw.trim(),
      proposedRules: validated,
    });
  } catch (err) {
    console.error("chat-rule-builder error:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
