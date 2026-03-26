"use client";

import { useState } from "react";
import { deleteBankProfile } from "@/lib/actions/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import type { BankProfile } from "@/types";

export function BankProfilesSection({ profiles }: { profiles: BankProfile[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Profiles</CardTitle>
        <CardDescription>
          These define how CSV files are parsed for each bank.
          Built-in profiles cannot be deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{profile.name}</p>
                  {profile.isSystem && (
                    <Badge variant="secondary" className="text-xs">built-in</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Date: {profile.dateColumn} ({profile.dateFormat}) ·
                  Desc: {profile.descriptionColumn} ·
                  Amount: {profile.amountColumn ?? `${profile.debitColumn}/${profile.creditColumn}`}
                </p>
              </div>
              {!profile.isSystem && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => deleteBankProfile(profile.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
