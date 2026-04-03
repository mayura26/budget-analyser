"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DatabaseExportSection() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/export-database");
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          /* ignore */
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budget.db";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the database.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export database</CardTitle>
        <CardDescription>
          Download a single SQLite snapshot of your data (WAL is merged into the
          file). Copy it to <code className="text-xs">data/budget.db</code> in
          another checkout to reproduce this environment locally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void handleDownload()}
        >
          <Download className="h-4 w-4 mr-2" />
          {pending ? "Preparing…" : "Download budget.db"}
        </Button>
      </CardContent>
    </Card>
  );
}
