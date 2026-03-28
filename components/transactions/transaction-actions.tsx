"use client";

import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CategoriseDialog } from "@/components/transactions/categorise-dialog";
import { ChatCategoriseDialog } from "@/components/transactions/chat-categorise-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AISuggestionScope } from "@/lib/actions/transactions";
import { recategoriseUncategorised } from "@/lib/actions/transactions";
import type { Category } from "@/types";

export function TransactionActions({
  uncategorisedCount,
  unfinalisedCount,
  confirmedCount,
  categories,
  categoryMains,
}: {
  uncategorisedCount: number;
  unfinalisedCount: number;
  confirmedCount: number;
  categories: Category[];
  categoryMains: Category[];
}) {
  const [categoriseOpen, setCategoriseOpen] = useState(false);
  const [categoriseScope, setCategoriseScope] =
    useState<AISuggestionScope>("uncategorised");
  const [chatOpen, setChatOpen] = useState(false);
  const [processing, startTransition] = useTransition();
  const router = useRouter();

  function openCategorise(scope: AISuggestionScope) {
    setCategoriseScope(scope);
    setCategoriseOpen(true);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="ai-actions-menu"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            AI actions
            <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={uncategorisedCount === 0 || processing}
            onClick={() => {
              startTransition(async () => {
                await recategoriseUncategorised();
                router.refresh();
              });
            }}
            data-testid="process-uncategorised"
          >
            Process uncategorised ({uncategorisedCount})
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={uncategorisedCount === 0}
            onClick={() => openCategorise("uncategorised")}
            data-testid="bulk-ai-scope-uncategorised"
          >
            AI categorise uncategorised ({uncategorisedCount})
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={uncategorisedCount === 0}
            onClick={() => setChatOpen(true)}
            data-testid="chat-categorise-button"
          >
            Chat &amp; categorise
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={unfinalisedCount === 0}
            onClick={() => openCategorise("unfinalised")}
            data-testid="bulk-ai-scope-unfinalised"
          >
            Recategorise unconfirmed ({unfinalisedCount})
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={confirmedCount === 0}
            onClick={() => openCategorise("mismatches")}
            data-testid="find-mismatches"
          >
            Find mismatches
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CategoriseDialog
        uncategorisedCount={uncategorisedCount}
        unfinalisedCount={unfinalisedCount}
        categories={categories}
        categoryMains={categoryMains}
        externalOpen={categoriseOpen}
        onExternalOpenChange={setCategoriseOpen}
        initialScope={categoriseScope}
      />
      <ChatCategoriseDialog
        categories={categories}
        externalOpen={chatOpen}
        onExternalOpenChange={setChatOpen}
      />
    </>
  );
}
