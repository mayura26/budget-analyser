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

export function DashboardMonthPicker({
  selectedMonth,
  minMonth,
  maxMonth,
  monthOptions,
}: {
  selectedMonth: string;
  minMonth: string;
  maxMonth: string;
  monthOptions: string[];
}) {
  const router = useRouter();
  const prevMonth = addCalendarMonths(selectedMonth, -1);
  const nextMonth = addCalendarMonths(selectedMonth, 1);
  const canGoBack = selectedMonth > minMonth;
  const canGoForward = selectedMonth < maxMonth;

  return (
    <div className="flex items-center gap-2">
      {canGoBack ? (
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
          <Link
            href={`/dashboard?month=${prevMonth}`}
            aria-label="Previous month"
          >
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
          router.push(`/dashboard?month=${value}`);
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
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
          <Link href={`/dashboard?month=${nextMonth}`} aria-label="Next month">
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
