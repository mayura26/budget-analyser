"use client";

import {
  CheckCircle,
  Loader2,
  MessageSquare,
  Send,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRulesBulk,
  createRulesBulkAndApplyToUnverified,
  previewUnverifiedMatchesForRules,
} from "@/lib/actions/categories";
import {
  applyCategorisations,
  getUncategorisedTransactions,
  type UncategorisedTransaction,
} from "@/lib/actions/transactions";
import {
  computeSuggestedRules,
  type SuggestedRule,
} from "@/lib/categorisation/rule-suggester";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Category } from "@/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
type DialogState =
  | "idle"
  | "loading"
  | "chatting"
  | "saving"
  | "suggestedRules"
  | "done"
  | "error";

type Applied = { normalised: string; categoryId: number; categoryName: string };

export function ChatCategoriseDialog({
  categories,
  externalOpen,
  onExternalOpenChange,
}: {
  categories: Category[];
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => onExternalOpenChange?.(v)
    : setInternalOpen;
  const [state, setState] = useState<DialogState>("idle");
  const [transactions, setTransactions] = useState<UncategorisedTransaction[]>(
    [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<number | null>(
    null,
  );
  const [suggestedCategoryName, setSuggestedCategoryName] = useState<
    string | null
  >(null);
  const [isConfident, setIsConfident] = useState(false);
  const [markVerifiedWhenApply, setMarkVerifiedWhenApply] = useState(true);
  const [overrideCategoryId, setOverrideCategoryId] = useState<number | null>(
    null,
  );
  const [appliedItems, setAppliedItems] = useState<Applied[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const [suggestedRules, setSuggestedRules] = useState<SuggestedRule[]>([]);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  function openDialog() {
    setOpen(true);
    setState("loading");
    setTransactions([]);
    setCurrentIndex(0);
    setMessages([]);
    setAppliedItems([]);
    setAppliedCount(0);
    setMarkVerifiedWhenApply(true);
    setErrorMsg("");

    startTransition(async () => {
      const result = await getUncategorisedTransactions();
      if (!result.success || result.data.length === 0) {
        setState("done");
        return;
      }
      setTransactions(result.data);
      setState("chatting");
      askAI(result.data[0], [], categories);
    });
  }

  const openDialogRef = useRef(openDialog);
  openDialogRef.current = openDialog;

  // When externally opened, trigger the dialog
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isControlled && externalOpen && !prevOpenRef.current) {
      openDialogRef.current();
    }
    prevOpenRef.current = externalOpen ?? false;
  }, [externalOpen, isControlled]);

  async function askAI(
    txn: UncategorisedTransaction,
    history: ChatMessage[],
    cats: Category[],
  ) {
    setAiThinking(true);
    setSuggestedCategoryId(null);
    setSuggestedCategoryName(null);
    setIsConfident(false);
    setOverrideCategoryId(null);

    try {
      const res = await fetch("/api/chat-categorise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: txn.id,
          messages: history.map(({ role, content }) => ({ role, content })),
          categories: cats,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? "AI request failed");
        setState("error");
        return;
      }

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.reply,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setSuggestedCategoryId(json.suggestedCategoryId);
      setSuggestedCategoryName(json.suggestedCategoryName);
      setIsConfident(json.isConfident);
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error — check your connection.");
      setState("error");
    } finally {
      setAiThinking(false);
    }
  }

  async function handleSend() {
    if (!userInput.trim() || aiThinking) return;
    const text = userInput.trim();
    setUserInput("");
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: text },
    ];
    setMessages(newMessages);
    const txn = transactions[currentIndex];
    await askAI(txn, newMessages, categories);
  }

  function handleConfirm() {
    const txn = transactions[currentIndex];
    const finalCategoryId = overrideCategoryId ?? suggestedCategoryId;
    if (!finalCategoryId) return;

    const cat = categories.find((c) => c.id === finalCategoryId);
    const newApplied: Applied = {
      normalised: txn.normalised,
      categoryId: finalCategoryId,
      categoryName: cat?.name ?? "Unknown",
    };

    setState("saving");
    startTransition(async () => {
      await applyCategorisations([
        {
          transactionId: txn.id,
          categoryId: finalCategoryId,
          source: "ai",
          confirm: markVerifiedWhenApply,
        },
      ]);
      const updatedApplied = [...appliedItems, newApplied];
      setAppliedItems(updatedApplied);
      setAppliedCount((n) => n + 1);
      advanceToNext(updatedApplied);
    });
  }

  function handleSkip() {
    advanceToNext(appliedItems);
  }

  function advanceToNext(currentApplied: Applied[]) {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= transactions.length) {
      finishSession(currentApplied);
      return;
    }
    setCurrentIndex(nextIndex);
    setMessages([]);
    setSuggestedCategoryId(null);
    setSuggestedCategoryName(null);
    setIsConfident(false);
    setMarkVerifiedWhenApply(true);
    setOverrideCategoryId(null);
    setState("chatting");
    askAI(transactions[nextIndex], [], categories);
  }

  function finishSession(applied: Applied[]) {
    if (applied.length === 0) {
      setState("done");
      return;
    }
    const rules = computeSuggestedRules(applied);
    if (rules.length === 0) {
      setState("done");
      return;
    }
    startTransition(async () => {
      const preview = await previewUnverifiedMatchesForRules(
        rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId })),
      );
      const merged =
        preview.success && preview.data
          ? rules.map((r) => {
              const key = `${r.pattern}::${r.categoryId}`;
              const row = preview.data.find((x) => x.key === key);
              return {
                ...r,
                unverifiedMatchCount: row?.count ?? 0,
              };
            })
          : rules.map((r) => ({ ...r, unverifiedMatchCount: 0 }));
      setSuggestedRules(merged);
      setSelectedRules(
        new Set(merged.map((r) => `${r.pattern}::${r.categoryId}`)),
      );
      setState("suggestedRules");
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

  function handleCreateRules() {
    const toCreate = suggestedRules
      .filter((r) => selectedRules.has(`${r.pattern}::${r.categoryId}`))
      .map((r) => ({ pattern: r.pattern, categoryId: r.categoryId }));

    startTransition(async () => {
      await createRulesBulk(toCreate);
      setState("done");
    });
  }

  function handleCreateRulesAndApply() {
    const toCreate = suggestedRules
      .filter((r) => selectedRules.has(`${r.pattern}::${r.categoryId}`))
      .map((r) => ({ pattern: r.pattern, categoryId: r.categoryId }));

    startTransition(async () => {
      const result = await createRulesBulkAndApplyToUnverified(toCreate);
      if (!result.success) {
        setErrorMsg(result.error ?? "Failed to create rules");
        setState("error");
        return;
      }
      setState("done");
    });
  }

  const currentTxn = transactions[currentIndex];
  const displayCategory = overrideCategoryId
    ? categories.find((c) => c.id === overrideCategoryId)?.name
    : suggestedCategoryName;
  const selectedRuleCount = selectedRules.size;

  return (
    <>
      {!isControlled && (
        <Button
          variant="outline"
          size="sm"
          onClick={openDialog}
          data-testid="chat-categorise-button"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Chat &amp; Categorise
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!isPending && !aiThinking) setOpen(v);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Chat &amp; Categorise</DialogTitle>
            <DialogDescription>
              {state === "loading" && "Loading uncategorised transactions…"}
              {(state === "chatting" || state === "saving") &&
                transactions.length > 0 &&
                `Transaction ${currentIndex + 1} of ${transactions.length}`}
              {state === "suggestedRules" &&
                `${appliedCount} categorised — create rules for future imports?`}
              {state === "done" &&
                `${appliedCount} transaction${appliedCount !== 1 ? "s" : ""} categorised.`}
              {state === "error" && errorMsg}
            </DialogDescription>
          </DialogHeader>

          {/* Loading */}
          {state === "loading" && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Chat */}
          {(state === "chatting" || state === "saving") && currentTxn && (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Transaction card */}
              <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm font-medium leading-snug">
                    {currentTxn.description}
                  </p>
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${
                      currentTxn.amount < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {currentTxn.amount < 0 ? "-" : "+"}
                    {formatCurrency(Math.abs(currentTxn.amount))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(currentTxn.date)} · {currentTxn.accountName}
                </p>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-40 sm:max-h-52 pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiThinking && (
                  <div className="flex justify-start">
                    <div className="rounded-lg px-3 py-2 bg-muted text-muted-foreground text-sm flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Confident suggestion */}
              {isConfident && !aiThinking && (
                <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Suggested:
                      </span>
                      <Badge className="text-xs bg-green-100 text-green-800 border-0 dark:bg-green-900 dark:text-green-200 max-w-[min(100%,14rem)] flex-col items-start h-auto py-1">
                        {displayCategory ? (
                          <CategoryNameParts
                            name={displayCategory}
                            variant="badge"
                          />
                        ) : null}
                      </Badge>
                    </div>
                    <Select
                      value={
                        overrideCategoryId
                          ? String(overrideCategoryId)
                          : "suggested"
                      }
                      onValueChange={(v) =>
                        setOverrideCategoryId(
                          v === "suggested" ? null : parseInt(v, 10),
                        )
                      }
                    >
                      <SelectTrigger className="h-6 text-xs w-auto gap-1 border-0 shadow-none bg-transparent text-muted-foreground hover:text-foreground">
                        <SelectValue placeholder="Use different" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suggested">Use suggested</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            <CategoryNameParts name={c.name} variant="select" />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Input area (shown when not yet confident) */}
              {!isConfident && !aiThinking && (
                <div className="flex gap-2">
                  <Input
                    data-testid="chat-input"
                    placeholder="Type your response…"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3"
                    onClick={handleSend}
                    disabled={!userInput.trim()}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Suggested rules */}
          {state === "suggestedRules" && (
            <div className="space-y-3 overflow-auto flex-1">
              <p className="text-sm text-muted-foreground">
                These rules will auto-categorise matching transactions on future
                imports. &quot;Unverified&quot; counts are existing unconfirmed
                transactions that match each keyword today.
              </p>
              <div className="rounded-md border divide-y">
                {suggestedRules.map((rule) => {
                  const key = `${rule.pattern}::${rule.categoryId}`;
                  const checked = selectedRules.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRule(key)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="font-mono text-sm font-medium">
                        "{rule.pattern}"
                      </span>
                      <span className="text-muted-foreground text-sm">→</span>
                      <span className="text-sm">{rule.categoryName}</span>
                      <Badge
                        variant="secondary"
                        className="ml-auto text-xs shrink-0"
                      >
                        {rule.matchCount} this session
                      </Badge>
                      {(rule.unverifiedMatchCount ?? 0) > 0 ? (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {rule.unverifiedMatchCount} unverified
                        </Badge>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-base font-semibold">
                {appliedCount === 0
                  ? "No transactions categorised"
                  : `${appliedCount} transaction${appliedCount !== 1 ? "s" : ""} categorised`}
              </p>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-destructive">{errorMsg}</p>
              <p className="text-xs text-muted-foreground">
                Make sure <code>OPENAI_API_KEY</code> is set and AI is enabled
                in Settings.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {(state === "chatting" || state === "saving") && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={aiThinking || isPending}
                  data-testid="skip-transaction"
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1.5" />
                  Skip
                </Button>
                {isConfident && !aiThinking && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground sm:mr-auto">
                      <input
                        type="checkbox"
                        checked={markVerifiedWhenApply}
                        onChange={(e) =>
                          setMarkVerifiedWhenApply(e.target.checked)
                        }
                        className="h-4 w-4 rounded"
                        data-testid="chat-mark-verified"
                      />
                      Mark as verified when applying
                    </label>
                    <Button
                      size="sm"
                      onClick={handleConfirm}
                      disabled={
                        isPending ||
                        (!suggestedCategoryId && !overrideCategoryId)
                      }
                      data-testid="confirm-category-chat"
                    >
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : null}
                      Confirm
                    </Button>
                  </>
                )}
              </>
            )}
            {state === "suggestedRules" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setState("done")}
                  disabled={isPending}
                >
                  Skip
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCreateRules}
                  disabled={selectedRuleCount === 0 || isPending}
                  data-testid="create-rules-only-chat"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    `Rules only (${selectedRuleCount})`
                  )}
                </Button>
                <Button
                  onClick={handleCreateRulesAndApply}
                  disabled={
                    selectedRuleCount === 0 ||
                    isPending ||
                    suggestedRules
                      .filter((r) =>
                        selectedRules.has(`${r.pattern}::${r.categoryId}`),
                      )
                      .every((r) => (r.unverifiedMatchCount ?? 0) === 0)
                  }
                  data-testid="create-rules-and-apply-chat"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Working…
                    </>
                  ) : (
                    "Create rules & update unverified"
                  )}
                </Button>
              </>
            )}
            {(state === "done" || state === "error") && (
              <Button onClick={() => setOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
