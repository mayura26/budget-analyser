"use client";

import { AlertCircle, CheckCircle, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmImport, previewImport } from "@/lib/actions/import";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Account, BankProfile, ImportPreview } from "@/types";

type Step = "upload" | "preview" | "done";

export function ImportWizard({
  accounts,
  bankProfiles,
}: {
  accounts: Account[];
  bankProfiles: BankProfile[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [doneResult, setDoneResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const [accountId, setAccountId] = useState<string>(
    accounts[0] ? String(accounts[0].id) : "",
  );
  const [profileId, setProfileId] = useState<string>(
    bankProfiles[0] ? String(bankProfiles[0].id) : "",
  );
  const [file, setFile] = useState<File | null>(null);

  async function handlePreview() {
    if (!file || !accountId || !profileId) {
      setError("Please select a file, account, and bank profile");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("accountId", accountId);
      formData.set("bankProfileId", profileId);
      formData.set("filename", file.name);
      if (file.name.toLowerCase().endsWith(".pdf")) {
        formData.set("pdfFile", file);
      } else {
        formData.set("csvContent", await file.text());
      }

      const result = await previewImport(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        setPreview(result.data);
        setStep("preview");
      }
    } catch (_err) {
      setError("Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      const result = await confirmImport(preview);
      if (!result.success) {
        setError(result.error);
      } else {
        setDoneResult({
          imported: result.data.imported,
          skipped: result.data.skipped,
        });
        setStep("done");
      }
    } catch (_err) {
      setError("Import failed");
    } finally {
      setLoading(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p>No accounts found.</p>
          <p className="text-sm mt-1">
            Please{" "}
            <a href="/accounts" className="underline text-primary">
              create an account
            </a>{" "}
            first.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (step === "done" && doneResult) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <div>
            <p className="text-lg font-semibold">Import complete!</p>
            <p className="text-muted-foreground text-sm mt-1">
              {doneResult.imported} transactions imported, {doneResult.skipped}{" "}
              skipped (duplicates)
            </p>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              If categories were applied automatically, confirm them on the
              transactions list.{" "}
              <a
                href="/transactions?needsReview=1"
                className="text-primary underline underline-offset-2"
              >
                Show pending confirmation
              </a>
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button asChild>
              <a href="/transactions">View transactions</a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setPreview(null);
                setDoneResult(null);
                setFile(null);
              }}
            >
              Import more
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "preview" && preview) {
    const _newRows = preview.rows.filter((r) => !r.isDuplicate);
    const _dupRows = preview.rows.filter((r) => r.isDuplicate);

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  {preview.newCount} new
                </Badge>
                <span className="text-muted-foreground">will be imported</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {preview.duplicateCount} duplicate
                </Badge>
                <span className="text-muted-foreground">will be skipped</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Date range: {preview.dateRangeStart} → {preview.dateRangeEnd}
            </p>
          </CardContent>
        </Card>

        <div className="rounded-md border overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr
                  key={row.fingerprint}
                  className={row.isDuplicate ? "opacity-40" : ""}
                >
                  <td className="px-3 py-1">
                    {row.isDuplicate ? (
                      <Badge variant="secondary" className="text-xs">
                        dup
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 text-xs border-0">
                        new
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-3 py-1 max-w-xs">
                    <p className="truncate">{row.description}</p>
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-medium whitespace-nowrap ${row.amount < 0 ? "text-red-600" : "text-green-600"}`}
                  >
                    {row.amount < 0 ? "-" : "+"}
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleConfirm}
            disabled={loading || preview.newCount === 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${preview.newCount} transactions`
            )}
          </Button>
          <Button variant="outline" onClick={() => setStep("upload")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
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

        <div className="space-y-2">
          <Label>Bank / Format</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger>
              <SelectValue placeholder="Select bank profile" />
            </SelectTrigger>
            <SelectContent>
              {bankProfiles.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">CSV or PDF File</p>
          <label
            htmlFor="csv-file"
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 cursor-pointer hover:border-muted-foreground/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files[0];
              const name = dropped?.name.toLowerCase() ?? "";
              if (name.endsWith(".csv") || name.endsWith(".pdf"))
                setFile(dropped);
            }}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {file ? file.name : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .csv or .pdf (CommBank)
            </p>
            <input
              id="csv-file"
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button
          onClick={handlePreview}
          disabled={loading || !file || !accountId || !profileId}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing…
            </>
          ) : (
            "Preview import"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
