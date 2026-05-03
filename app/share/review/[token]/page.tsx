import { BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import {
  type DeepReview,
  type DigestReview,
  type ReviewMetrics,
  ReviewReport,
} from "@/components/budget/review-report";
import { findReviewByShareToken } from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SharedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = findReviewByShareToken<
    DigestReview | DeepReview,
    ReviewMetrics
  >(token);
  if (!found) notFound();

  const homeCurrency = getHomeCurrency();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Budget Analyser · Shared review
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Generated {relativeTime(found.generatedAt)}
          </span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ReviewReport
          data={{
            format: found.format,
            metrics: found.metrics,
            review: found.review,
          }}
          homeCurrency={homeCurrency}
        />
        <p className="mt-8 text-center text-xs text-muted-foreground">
          This is a read-only snapshot of the {found.metrics.monthLabel}{" "}
          {found.format === "deep" ? "deep" : "quick"} review.
        </p>
      </main>
    </div>
  );
}
