"use client";

import { FileSearch, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteBankProfile } from "@/lib/actions/settings";
import { bankProfileFilenamePatterns } from "@/lib/import/profiles";
import type { BankProfile } from "@/types";

export function BankProfilesSection({ profiles }: { profiles: BankProfile[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Profiles</CardTitle>
        <CardDescription>
          These define how CSV files are parsed for each bank. Built-in profiles
          cannot be deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank profiles yet. Profiles are added when you parse a CSV via
            the import wizard.
          </p>
        ) : (
          <div className="space-y-2">
            {profiles.map((profile) => {
              const filenamePatterns = bankProfileFilenamePatterns(profile);

              return (
                <div
                  key={profile.id}
                  className="flex items-start gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{profile.name}</p>
                      {profile.isSystem && (
                        <Badge variant="secondary" className="text-xs">
                          built-in
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      Date: {profile.dateColumn} ({profile.dateFormat}) · Desc:{" "}
                      {profile.descriptionColumn} · Amount:{" "}
                      {profile.amountColumn ??
                        `${profile.debitColumn}/${profile.creditColumn}`}
                    </p>
                    {filenamePatterns.length > 0 && (
                      <div
                        className="mt-2 flex flex-wrap items-center gap-1.5"
                        data-testid="bank-profile-filename-patterns"
                      >
                        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <FileSearch className="h-3 w-3" />
                          Auto-detect files
                        </span>
                        {filenamePatterns.map((pattern) => (
                          <Badge
                            key={pattern}
                            variant="outline"
                            className="font-mono text-[10px] font-normal"
                          >
                            {pattern}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {!profile.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => deleteBankProfile(profile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
