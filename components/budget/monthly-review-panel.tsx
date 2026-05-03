"use client";

import { Check, Copy, Image as ImageIcon, Link2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ReportSkeleton,
  type ReviewFormat,
  type ReviewPayload,
  ReviewReport,
} from "@/components/budget/review-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createOrGetReviewShare,
  revokeReviewShare,
} from "@/lib/actions/budget-review-shares";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, relativeTime } from "@/lib/utils";

type ReviewResponse = ReviewPayload & {
  cached?: boolean;
  model?: string;
  generatedAt?: number;
};

export function MonthlyReviewPanel({
  month,
  homeCurrency,
}: {
  month: string;
  homeCurrency: SupportedCurrency;
}) {
  const [format, setFormat] = useState<ReviewFormat>("digest");
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewResponse | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    // Different review, different share link — drop the cached URL.
    setShareUrl(null);
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai-budget-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, format, regenerate: false }),
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

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-budget-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, format, regenerate: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to regenerate review");
      setData(body as ReviewResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegenerating(false);
    }
  };

  const openShare = async () => {
    setShareOpen(true);
    setShareError(null);
    setCopied(false);
    if (shareUrl) return;
    setShareLoading(true);
    try {
      const result = await createOrGetReviewShare(month, format);
      if (!result.success) {
        setShareError(result.error);
        return;
      }
      const url = `${window.location.origin}/share/review/${result.token}`;
      setShareUrl(url);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Failed to create link",
      );
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError("Could not copy to clipboard");
    }
  };

  const handleRevoke = async () => {
    if (!shareUrl) return;
    const tokenFromUrl = shareUrl.split("/").pop() ?? "";
    setShareLoading(true);
    setShareError(null);
    try {
      const result = await revokeReviewShare(tokenFromUrl);
      if (!result.success) {
        setShareError(result.error);
        return;
      }
      setShareUrl(null);
      setShareOpen(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setShareLoading(false);
    }
  };

  const handleExportImage = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(reportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      const link = document.createElement("a");
      link.download = `budget-review-${month}-${format}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export image");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Tabs
            value={format}
            onValueChange={(value) => setFormat(value as ReviewFormat)}
          >
            <TabsList>
              <TabsTrigger value="digest">Quick Digest</TabsTrigger>
              <TabsTrigger value="deep">Deep Review</TabsTrigger>
            </TabsList>
          </Tabs>
          {data?.cached && (
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide"
            >
              Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={openShare}
            disabled={!data || loading}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportImage}
            disabled={!data || loading || exporting}
          >
            {exporting ? (
              <RotateCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            )}
            Export image
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating || loading || !data}
          >
            <RotateCw
              className={cn(
                "h-3.5 w-3.5 mr-1.5",
                regenerating && "animate-spin",
              )}
            />
            Regenerate
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/budget?month=${month}`}>Back to budget</Link>
          </Button>
        </div>
      </div>

      {loading && !data && <ReportSkeleton />}

      {error && !data && (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRegenerate}
            >
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <ReviewReport
            ref={reportRef}
            data={{
              format: data.format,
              metrics: data.metrics,
              review: data.review,
            }}
            homeCurrency={homeCurrency}
          />

          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
            {data.generatedAt && (
              <span>Generated {relativeTime(data.generatedAt)}</span>
            )}
            {data.model && <span>· Model {data.model}</span>}
            {error && (
              <span className="text-red-600 dark:text-red-400">· {error}</span>
            )}
          </div>
        </>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this review</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the{" "}
              {format === "deep" ? "deep" : "quick"} review for{" "}
              {data?.metrics.monthLabel ?? month}. The link is read-only and
              stays active until you revoke it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {shareLoading && !shareUrl && (
              <p className="text-sm text-muted-foreground">Creating link…</p>
            )}
            {shareError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {shareError}
              </p>
            )}
            {shareUrl && (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: this link works without logging in — perfect for sharing
                  with your partner.
                </p>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {shareUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                disabled={shareLoading}
                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Revoke link
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
