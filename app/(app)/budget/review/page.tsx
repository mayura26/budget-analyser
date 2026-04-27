export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MonthlyReviewPanel } from "@/components/budget/monthly-review-panel";
import { getHomeCurrency } from "@/lib/currency/home";
import { isMonthClosed } from "@/lib/budget/queries";
import { addCalendarMonths, getCurrentMonth, parseMonthParam } from "@/lib/utils";

export default async function BudgetReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const currentMonth = getCurrentMonth();
  const defaultMonth = addCalendarMonths(currentMonth, -1);
  const month = parseMonthParam(params.month, "1900-01", defaultMonth);
  const closed = isMonthClosed(month);
  const homeCurrency = getHomeCurrency();

  if (!closed) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Monthly Review</h1>
        <p className="text-sm text-muted-foreground">
          This month is not closed yet. Close the month from the budget page to
          generate the AI review.
        </p>
        <Button asChild variant="outline">
          <Link href={`/budget?month=${month}`}>Go to budget month</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <MonthlyReviewPanel month={month} homeCurrency={homeCurrency} />
    </div>
  );
}
