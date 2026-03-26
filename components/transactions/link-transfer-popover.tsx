"use client";

import { useState } from "react";
import {
  findTransferCandidates,
  linkTransactions,
  unlinkTransaction,
  type TransferCandidate,
} from "@/lib/actions/transactions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeftRight, Link2Off, Loader2 } from "lucide-react";

export function LinkTransferPopover({
  transactionId,
  linkedTransactionId,
}: {
  transactionId: number;
  linkedTransactionId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<TransferCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  async function handleOpen(v: boolean) {
    setOpen(v);
    if (v && !linkedTransactionId) {
      setLoading(true);
      const result = await findTransferCandidates(transactionId);
      setCandidates(result.success ? result.data : []);
      setLoading(false);
    }
  }

  async function handleLink(candidateId: number) {
    setLinking(true);
    await linkTransactions(transactionId, candidateId);
    setLinking(false);
    setOpen(false);
  }

  async function handleUnlink() {
    setLinking(true);
    await unlinkTransaction(transactionId);
    setLinking(false);
    setOpen(false);
  }

  if (linkedTransactionId) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-green-600">
            <ArrowLeftRight className="h-3 w-3" />
            Linked
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3" align="end">
          <p className="text-xs text-muted-foreground mb-2">
            This transfer is linked to transaction #{linkedTransactionId}.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handleUnlink}
            disabled={linking}
          >
            {linking ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Link2Off className="h-3 w-3 mr-1" />
            )}
            Unlink
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeftRight className="h-3 w-3" />
          Link
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-xs font-medium mb-2">Link to matching transfer</p>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !candidates || candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No matching transactions found. Looking for same amount, opposite sign, within ±2 days.
          </p>
        ) : (
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <button
                key={c.transactionId}
                onClick={() => handleLink(c.transactionId)}
                disabled={linking}
                className="w-full text-left rounded border p-2 text-xs hover:bg-muted transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium truncate max-w-[140px]">{c.accountName}</span>
                  <span className={c.amount < 0 ? "text-red-600" : "text-green-600"}>
                    {c.amount < 0 ? "-" : "+"}{formatCurrency(c.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate max-w-[140px]">{c.description}</span>
                  <span>{formatDate(c.date)}</span>
                </div>
                {c.sameGroup && (
                  <Badge variant="secondary" className="text-[10px] mt-1 px-1 py-0">
                    Same bank
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
