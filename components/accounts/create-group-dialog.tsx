"use client";

import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { AccountColourPicker } from "@/components/accounts/account-colour-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_GROUP_SWATCH_COLORS } from "@/lib/accounts/account-group-swatch-colors";
import { listDerivedAccountMemberColors } from "@/lib/accounts/account-member-colors";
import { createAccountGroup } from "@/lib/actions/account-groups";

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string>(ACCOUNT_GROUP_SWATCH_COLORS[0]);

  const derivedPreview = useMemo(
    () => listDerivedAccountMemberColors(color, 8),
    [color],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setColor(ACCOUNT_GROUP_SWATCH_COLORS[0]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FolderPlus className="h-4 w-4 mr-2" />
          Add group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            setError(null);
            fd.set("color", color);
            const result = await createAccountGroup(null, fd);
            setPending(false);
            if (result.success) {
              setOpen(false);
            } else {
              setError(result.error);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" placeholder="e.g. CommBank" required autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Group colour</Label>
            <p className="text-xs text-muted-foreground">
              This is the main bank colour. Account colours can follow it or use
              the suggested variants below.
            </p>
            <AccountColourPicker
              value={color}
              onChange={setColor}
              suggestions={derivedPreview}
              suggestionsLabel="Suggested account colours (same family)"
              swatchSize="sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create group"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
