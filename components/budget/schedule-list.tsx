"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ScheduleDialog } from "./schedule-dialog";
import { AISchedulerDialog } from "./ai-scheduler-dialog";
import {
  deleteScheduledTransaction,
  toggleScheduledTransaction,
} from "@/lib/actions/scheduled";
import type { ScheduledTransaction, Account, Category } from "@/types";

interface Props {
  schedules: ScheduledTransaction[];
  accounts: Account[];
  categories: Category[];
  aiEnabled?: boolean;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function nextOccurrenceDate(schedule: ScheduledTransaction): string {
  const today = new Date().toISOString().slice(0, 10);
  let current = schedule.startDate;

  if (current >= today) return current;

  // Advance until >= today
  const freq = schedule.frequency;
  while (current < today) {
    if (freq === "weekly") {
      const d = new Date(current + "T00:00:00");
      d.setDate(d.getDate() + 7);
      current = d.toISOString().slice(0, 10);
    } else if (freq === "fortnightly") {
      const d = new Date(current + "T00:00:00");
      d.setDate(d.getDate() + 14);
      current = d.toISOString().slice(0, 10);
    } else {
      const [y, m, day] = current.split("-").map(Number);
      const months =
        freq === "monthly" ? 1 : freq === "quarterly" ? 3 : 12;
      const nd = new Date(y, m - 1 + months, 1);
      const lastDay = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
      const clampedDay = Math.min(day, lastDay);
      current = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
    }
  }
  return current;
}

export function ScheduleList({ schedules, accounts, categories, aiEnabled = false }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduledTransaction | null>(null);
  const [, startTransition] = useTransition();

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  function handleEdit(s: ScheduledTransaction) {
    setEditTarget(s);
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteScheduledTransaction(id);
    });
  }

  function handleToggle(id: number, current: boolean) {
    startTransition(async () => {
      await toggleScheduledTransaction(id, !current);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scheduled transactions</h2>
        <div className="flex items-center gap-2">
          {aiEnabled && <AISchedulerDialog categories={categories} />}
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add schedule
          </Button>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No scheduled transactions yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s) => {
            const isIncome = s.amount > 0;
            const nextDate = nextOccurrenceDate(s);
            return (
              <div
                key={s.id}
                className={`rounded-lg border p-4 space-y-2 transition-opacity ${
                  s.isActive ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium truncate">{s.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {FREQ_LABELS[s.frequency]}
                    </Badge>
                  </div>
                  <span
                    className={`text-lg font-semibold whitespace-nowrap ${
                      isIncome ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isIncome ? "+" : "-"}$
                    {Math.abs(s.amount).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground space-y-0.5">
                  {s.accountId && (
                    <p>Account: {accountMap.get(s.accountId) ?? s.accountId}</p>
                  )}
                  <p>Next: {nextDate}</p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => handleToggle(s.id, s.isActive)}
                  >
                    {s.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleEdit(s)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(s.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={editTarget}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
