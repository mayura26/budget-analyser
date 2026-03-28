"use client";

import { useActionState, useEffect, useState } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { CategorySelectGrouped } from "@/components/categories/category-select-grouped";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createScheduledTransaction,
  updateScheduledTransaction,
} from "@/lib/actions/scheduled";
import type {
  Account,
  ActionResult,
  Category,
  ScheduledTransaction,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schedule?: ScheduledTransaction | null;
  accounts: Account[];
  categories: Category[];
  categoryMains?: Category[];
}

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

const today = new Date().toISOString().slice(0, 10);

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  accounts,
  categories,
  categoryMains,
}: Props) {
  const isEdit = !!schedule;
  const [type, setType] = useState<"income" | "expense">("expense");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    if (schedule) {
      setType(schedule.amount > 0 ? "income" : "expense");
      setFrequency(schedule.frequency);
      setAccountId(schedule.accountId ? String(schedule.accountId) : "");
      setCategoryId(schedule.categoryId ? String(schedule.categoryId) : "");
    } else {
      setType("expense");
      setFrequency("monthly");
      setAccountId("");
      setCategoryId("");
    }
  }, [schedule, open]);

  const boundUpdate = schedule
    ? updateScheduledTransaction.bind(null, schedule.id)
    : null;

  const action = isEdit ? boundUpdate! : createScheduledTransaction;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(
    action as (
      state: ActionResult | null,
      payload: FormData,
    ) => Promise<ActionResult | null>,
    null,
  );

  useEffect(() => {
    if (state?.success) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit schedule" : "Add schedule"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {/* Hidden fields for controlled select values */}
          <input type="hidden" name="frequency" value={frequency} />
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="categoryId" value={categoryId} />
          {/* amountType so server action knows the sign */}
          <input type="hidden" name="amountType" value={type} />

          <div className="space-y-1">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              name="name"
              defaultValue={schedule?.name ?? ""}
              placeholder="e.g. Salary, Rent"
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === "income" ? "default" : "outline"}
                size="sm"
                onClick={() => setType("income")}
              >
                Income
              </Button>
              <Button
                type="button"
                variant={type === "expense" ? "default" : "outline"}
                size="sm"
                onClick={() => setType("expense")}
              >
                Expense
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sched-amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                id="sched-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                className="pl-7"
                defaultValue={schedule ? Math.abs(schedule.amount) : ""}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sched-start">Start date</Label>
              <Input
                id="sched-start"
                name="startDate"
                type="date"
                defaultValue={schedule?.startDate ?? today}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sched-end">End date (optional)</Label>
              <Input
                id="sched-end"
                name="endDate"
                type="date"
                defaultValue={schedule?.endDate ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Account (optional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="No account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                {categoryMains && categoryMains.length > 0 ? (
                  <CategorySelectGrouped
                    categories={categories}
                    mains={categoryMains}
                  />
                ) : (
                  categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <CategoryNameParts name={c.name} variant="select" />
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sched-notes">Notes (optional)</Label>
            <Textarea
              id="sched-notes"
              name="notes"
              defaultValue={schedule?.notes ?? ""}
              rows={2}
            />
          </div>

          {state && !state.success && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
