"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addCalendarMonths, formatMonth } from "@/lib/utils";

export function BudgetMonthPicker({
  selectedMonth,
  minMonth,
  maxMonth,
  monthOptions,
  analysisCategory,
}: {
  selectedMonth: string;
  minMonth: string;
  maxMonth: string;
  monthOptions: string[];
  analysisCategory?: number;
}) {
  const router = useRouter();
  const prevMonth = addCalendarMonths(selectedMonth, -1);
  const nextMonth = addCalendarMonths(selectedMonth, 1);
  const canGoBack = selectedMonth > minMonth;
  // Allow navigating one month into the future for planning
  const canGoForward = selectedMonth < maxMonth;
  const monthHref = (month: string) =>
    analysisCategory === undefined
      ? `/budget?month=${month}`
      : `/budget?month=${month}&tab=spend-analysis&category=${analysisCategory}`;

  return (
    <div className="flex items-center gap-2">
      {canGoBack ? (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          asChild
        >
          <Link href={monthHref(prevMonth)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      <Select
        value={selectedMonth}
        onValueChange={(value) => {
          router.push(monthHref(value));
        }}
      >
        <SelectTrigger className="h-9 w-[min(100vw-8rem,14rem)] sm:w-56">
          <SelectValue placeholder={formatMonth(selectedMonth)} />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonth(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {canGoForward ? (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          asChild
        >
          <Link href={monthHref(nextMonth)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
