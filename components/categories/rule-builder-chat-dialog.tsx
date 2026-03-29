"use client";

import { Loader2, MessageSquare, RefreshCw, Send, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createRulesFromDrafts,
  createRulesFromDraftsAndApplyToUnverified,
  previewUnverifiedMatchesForRules,
} from "@/lib/actions/categories";
import { getRuleBuilderTransactionSample } from "@/lib/actions/rule-builder";
import type { RuleBuilderTransactionRow } from "@/lib/actions/rule-builder";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Category, RuleDraftInput } from "@/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function ruleKey(r: RuleDraftInput): string {
  return `${r.pattern}::${r.categoryId}::${r.patternType}`;
}

export function RuleBuilderChatDialog({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sample, setSample] = useState<RuleBuilderTransactionRow[]>([]);
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [proposedRules, setProposedRules] = useState<RuleDraftInput[]>([]);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [previewCounts, setPreviewCounts] = useState<
    Record<string, number | undefined>
  >({});
  const [isPending, startTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const byCategoryId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filteredSample = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sample;
    return sample.filter(
      (t) =>
        t.normalised.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [sample, search]);

  async function loadSample(onlyUnverified: boolean) {
    setLoadingSample(true);
    setErrorMsg("");
    try {
      const result = await getRuleBuilderTransactionSample({
        unverifiedOnly: onlyUnverified,
      });
      if (!result.success) {
        setErrorMsg("Could not load transactions.");
        return;
      }
      setSample(result.data);
    } finally {
      setLoadingSample(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMessages([]);
      setUserInput("");
      setProposedRules([]);
      setSelectedRules(new Set());
      setPreviewCounts({});
      setSearch("");
      setUnverifiedOnly(false);
      setErrorMsg("");
      void loadSample(false);
    }
  }

  async function sendChat(history: ChatMessage[]) {
    setAiThinking(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/chat-rule-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          categories,
          transactions: filteredSample,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? "AI request failed");
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            json.error === "AI is disabled in settings"
              ? "Turn on AI in Settings to use the rule assistant."
              : "Something went wrong. Check that OPENAI_API_KEY is set and AI is enabled.",
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.reply ?? "",
      };
      setMessages((prev) => [...prev, aiMsg]);

      const rules: RuleDraftInput[] = Array.isArray(json.proposedRules)
        ? json.proposedRules
        : [];
      if (rules.length > 0) {
        setProposedRules(rules);
        setSelectedRules(new Set(rules.map(ruleKey)));
        setPreviewCounts({});
      }
    } catch {
      setErrorMsg("Network error — check your connection.");
    } finally {
      setAiThinking(false);
    }
  }

  function handleSend() {
    const text = userInput.trim();
    if (!text || aiThinking) return;
    setUserInput("");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    void sendChat(next);
  }

  function toggleUnverified(checked: boolean) {
    setUnverifiedOnly(checked);
    void loadSample(checked);
  }

  function handlePreview() {
    const selected = proposedRules.filter((r) =>
      selectedRules.has(ruleKey(r)),
    );
    if (selected.length === 0) return;
    startTransition(async () => {
      const result = await previewUnverifiedMatchesForRules(selected);
      if (!result.success || !result.data) return;
      const map: Record<string, number> = {};
      for (const row of result.data) {
        map[row.key] = row.count;
      }
      setPreviewCounts(map);
    });
  }

  function handleSave() {
    const selected = proposedRules.filter((r) =>
      selectedRules.has(ruleKey(r)),
    );
    if (selected.length === 0) return;
    startTransition(async () => {
      await createRulesFromDrafts(selected);
      setOpen(false);
    });
  }

  function handleSaveAndApply() {
    const selected = proposedRules.filter((r) =>
      selectedRules.has(ruleKey(r)),
    );
    if (selected.length === 0) return;
    startTransition(async () => {
      const result = await createRulesFromDraftsAndApplyToUnverified(selected);
      if (!result.success) {
        setErrorMsg(result.error ?? "Failed to apply rules");
        return;
      }
      setOpen(false);
    });
  }

  function toggleRule(key: string) {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="rule-builder-chat-trigger">
          <Sparkles className="h-4 w-4 mr-2" />
          Rule assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] h-[min(90vh,800px)] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Build rules with AI
          </DialogTitle>
          <DialogDescription>
            Use your transaction sample as context. Describe patterns (e.g.
            merchant names) and map them to sub-categories. Save keyword or regex
            rules when you are happy with the preview.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-border">
          <div className="flex flex-col border-r border-border min-h-0 p-4 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">
                Context
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rb-unverified"
                  checked={unverifiedOnly}
                  onChange={(e) => toggleUnverified(e.target.checked)}
                  className="h-4 w-4 rounded border border-input"
                />
                <label
                  htmlFor="rb-unverified"
                  className="text-sm cursor-pointer"
                >
                  Unverified only
                </label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => void loadSample(unverifiedOnly)}
                disabled={loadingSample}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1 ${loadingSample ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
            <Input
              placeholder="Filter sample (description)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              data-testid="rule-builder-sample-search"
            />
            <ScrollArea className="flex-1 min-h-[200px] rounded-md border border-border">
              {loadingSample ? (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredSample.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No transactions in this sample. Import data or turn off
                  filters.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="p-2 font-medium">Date</th>
                      <th className="p-2 font-medium">Description</th>
                      <th className="p-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSample.map((t) => {
                      const cat = t.categoryId
                        ? byCategoryId.get(t.categoryId)
                        : null;
                      const catLabel =
                        cat?.name ?? t.categoryName?.trim() ?? null;
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-border/60 align-top"
                        >
                          <td className="p-2 whitespace-nowrap text-muted-foreground">
                            {formatDate(t.date)}
                          </td>
                          <td className="p-2">
                            <div className="line-clamp-2 break-words">
                              {t.description}
                            </div>
                            {catLabel ? (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                <CategoryNameParts name={catLabel} />
                              </div>
                            ) : null}
                          </td>
                          <td className="p-2 text-right tabular-nums whitespace-nowrap">
                            {formatCurrency(t.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </div>

          <div className="flex flex-col min-h-0 p-4 gap-2">
            <ScrollArea className="flex-1 min-h-[160px] rounded-md border border-border p-3">
              <div className="space-y-3 pr-2">
                {messages.length === 0 && !aiThinking && (
                  <p className="text-sm text-muted-foreground">
                    Ask for rules using the sample on the left — for example:
                    &quot;Anything with MESSINA should be Ice cream&quot; or
                    &quot;Pizza places → Takeout&quot;.
                  </p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "ml-6 rounded-lg bg-muted px-3 py-2 text-sm"
                        : "mr-4 rounded-lg border border-border px-3 py-2 text-sm"
                    }
                  >
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {m.role === "user" ? "You" : "Assistant"}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
                {aiThinking && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                placeholder="Message…"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={aiThinking}
                data-testid="rule-builder-chat-input"
              />
              <Button
                type="button"
                onClick={handleSend}
                disabled={aiThinking || !userInput.trim()}
                data-testid="rule-builder-chat-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {errorMsg ? (
              <p className="text-sm text-destructive">{errorMsg}</p>
            ) : null}

            {proposedRules.length > 0 && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="text-sm font-medium">Proposed rules</div>
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {proposedRules.map((r) => {
                    const key = ruleKey(r);
                    const cat = byCategoryId.get(r.categoryId);
                    const previewKey =
                      r.patternType === "keyword"
                        ? `${r.pattern}::${r.categoryId}`
                        : `${r.pattern}::${r.categoryId}::${r.patternType}`;
                    const count = previewCounts[previewKey];
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-2 text-sm border-b border-border/60 pb-2 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRules.has(key)}
                          onChange={() => toggleRule(key)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border border-input"
                        />
                        <div className="flex-1 min-w-0">
                          <code className="text-xs bg-muted px-1 rounded">
                            {r.patternType}
                          </code>{" "}
                          <span className="font-mono break-all">{r.pattern}</span>
                          <div className="text-muted-foreground mt-0.5">
                            →{" "}
                            {cat ? (
                              <CategoryNameParts name={cat.name} />
                            ) : (
                              `#${r.categoryId}`
                            )}
                          </div>
                          {count !== undefined && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {count} unverified match
                              {count === 1 ? "" : "es"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handlePreview}
                    disabled={isPending || proposedRules.length === 0}
                  >
                    Preview matches
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isPending || selectedRules.size === 0}
                  >
                    Save rules
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={handleSaveAndApply}
                    disabled={isPending || selectedRules.size === 0}
                  >
                    Save &amp; apply to unverified
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
