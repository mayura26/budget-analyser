"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createManualTransaction } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account, Category, ActionResult } from "@/types";

export function ManualTransactionForm({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createManualTransaction as (
      state: ActionResult<{ id: number }> | null,
      formData: FormData
    ) => Promise<ActionResult<{ id: number }>>,
    null
  );

  useEffect(() => {
    if (state?.success) {
      router.push("/transactions");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accountId">Account</Label>
        <select
          id="accountId"
          name="accountId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" required placeholder="e.g. Coffee at Starbucks" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount (negative = expense)</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          required
          placeholder="-12.50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId">Category (optional)</Label>
        <select
          id="categoryId"
          name="categoryId"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Auto-categorise</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Any additional notes…" />
      </div>

      {state && !state.success && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save transaction"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
