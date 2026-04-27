"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency, formatMonth } from "@/lib/utils";

type ReviewFormat = "digest" | "deep";

type ReviewResponse = {
  format: ReviewFormat;
  metrics: {
    month: string;
    monthLabel: string;
    totalBudgeted: number;
    totalSpent: number;
    projectedSpend: number;
    netVariance: number;
    onTrack: boolean;
    topOverspend: { category: string; amount: number; message: string }[];
    topUnderspend: { category: string; amount: number; message: string }[];
  };
  review:
    | {
        headline: string;
        risks: string[];
        wins: string[];
        actions: string[];
      }
    | {
        executiveSummary: string;
        keyFindings: string[];
        varianceDrivers: string[];
        recommendations: string[];
      };
};

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {items.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function MonthlyReviewPanel({
  month,
  homeCurrency,
}: {
  month: string;
  homeCurrency: SupportedCurrency;
}) {
  const [format, setFormat] = useState<ReviewFormat>("digest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewResponse | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai-budget-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, format }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Failed to load review");
        if (active) setData(body as ReviewResponse);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [format, month]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-lg">
                End-of-month review for {formatMonth(month)}
              </CardTitle>
            </div>
            <Tabs
              value={format}
              onValueChange={(value) => setFormat(value as ReviewFormat)}
            >
              <TabsList>
                <TabsTrigger value="digest">Quick Digest</TabsTrigger>
                <TabsTrigger value="deep">Deep Review</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading && (
            <p className="text-sm text-muted-foreground">Generating review...</p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={data.metrics.onTrack ? "default" : "destructive"}>
                {data.metrics.onTrack ? "On budget" : "Over budget"}
              </Badge>
              <span>
                Budgeted {formatCurrency(data.metrics.totalBudgeted, homeCurrency)}
              </span>
              <span>
                Spent {formatCurrency(data.metrics.totalSpent, homeCurrency)}
              </span>
              <span>
                Variance {formatCurrency(data.metrics.netVariance, homeCurrency)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.format === "digest" && "headline" in data.review && (
        <>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm">{data.review.headline}</p>
            </CardContent>
          </Card>
          <SectionList title="Key Risks" items={data.review.risks} />
          <SectionList title="Wins" items={data.review.wins} />
          <SectionList title="Actions For Next Month" items={data.review.actions} />
        </>
      )}

      {data && data.format === "deep" && "executiveSummary" in data.review && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm">{data.review.executiveSummary}</p>
            </CardContent>
          </Card>
          <SectionList title="Key Findings" items={data.review.keyFindings} />
          <SectionList title="Variance Drivers" items={data.review.varianceDrivers} />
          <SectionList
            title="Recommendations"
            items={data.review.recommendations}
          />
        </>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Category Movement</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">Overspend</p>
              <ul className="text-sm space-y-1">
                {data.metrics.topOverspend.length === 0 && (
                  <li className="text-muted-foreground">No overspend categories.</li>
                )}
                {data.metrics.topOverspend.map((item) => (
                  <li key={`over-${item.category}`}>{item.message}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Underspend</p>
              <ul className="text-sm space-y-1">
                {data.metrics.topUnderspend.length === 0 && (
                  <li className="text-muted-foreground">
                    No underspend categories.
                  </li>
                )}
                {data.metrics.topUnderspend.map((item) => (
                  <li key={`under-${item.category}`}>{item.message}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <Button variant="outline" asChild>
          <Link href={`/budget?month=${month}`}>Back to budget</Link>
        </Button>
      </div>
    </div>
  );
}
