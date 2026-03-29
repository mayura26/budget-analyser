import { z } from "zod";
import { assignableCategoryError } from "@/lib/categories/assignable";
import type { RuleDraftInput } from "@/types";

const ProposedRuleSchema = z.object({
  categoryId: z.number(),
  pattern: z.string().min(1),
  patternType: z.enum(["keyword", "regex", "exact"]),
  rationale: z.string().optional(),
});

const ProposedRulesPayloadSchema = z.object({
  proposedRules: z.array(ProposedRuleSchema),
});

export type ProposedRuleFromAI = z.infer<typeof ProposedRuleSchema>;

const MAX_NORMALISED_IN_PROMPT = 120;

export function truncateForPrompt(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_NORMALISED_IN_PROMPT) return t;
  return `${t.slice(0, MAX_NORMALISED_IN_PROMPT)}…`;
}

/** Parse ```json ...``` or a JSON object containing proposedRules from model output. */
export function extractProposedRulesFromAssistantContent(content: string): {
  displayReply: string;
  proposedRules: RuleDraftInput[];
} {
  let jsonStr: string | undefined;
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    jsonStr = fence[1].trim();
  } else {
    const start = content.indexOf('{"proposedRules"');
    if (start === -1) {
      const alt = content.search(/\{\s*"proposedRules"\s*:/);
      if (alt !== -1) {
        jsonStr = extractBalancedJson(content, alt);
      }
    } else {
      jsonStr = extractBalancedJson(content, start);
    }
  }

  if (!jsonStr) {
    return { displayReply: content.trim(), proposedRules: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { displayReply: content.trim(), proposedRules: [] };
  }

  const result = ProposedRulesPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return { displayReply: content.trim(), proposedRules: [] };
  }

  const proposedRules: RuleDraftInput[] = [];
  for (const r of result.data.proposedRules) {
    if (assignableCategoryError(r.categoryId)) continue;
    if (r.patternType === "regex") {
      try {
        new RegExp(r.pattern, "i");
      } catch {
        continue;
      }
    }
    proposedRules.push({
      categoryId: r.categoryId,
      pattern: r.pattern,
      patternType: r.patternType,
    });
  }

  let displayReply = content;
  if (fence?.[0]) {
    displayReply = content.replace(fence[0], "").trim();
  } else if (jsonStr) {
    displayReply = content.replace(jsonStr, "").trim();
  }

  return { displayReply, proposedRules };
}

function extractBalancedJson(s: string, start: number): string | undefined {
  if (s[start] !== "{") return undefined;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return undefined;
}
