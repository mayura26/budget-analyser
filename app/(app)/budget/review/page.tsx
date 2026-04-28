export const dynamic = "force-dynamic";

import Link from "next/link";
import { MonthlyReviewPanel } from "@/components/budget/monthly-review-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { isMonthClosed } from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import {
  addCalendarMonths,
  getCurrentMonth,
  parseMonthParam,
} from "@/lib/utils";

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
        <PageHeader
          title="Monthly Review"
          subtitle="This month is not closed yet. Close the month from the budget page to generate the AI review."
        />
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
