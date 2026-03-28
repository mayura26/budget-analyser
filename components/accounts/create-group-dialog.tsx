"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";
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
import { createAccountGroup } from "@/lib/actions/account-groups";

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
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
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
                <label key={color} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={color}
                    className="sr-only"
                    defaultChecked={color === ACCOUNT_GROUP_SWATCH_COLORS[0]}
                  />
                  <div
                    className="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-transparent has-[:checked]:ring-foreground"
                    style={{ backgroundColor: color }}
                  />
                </label>
              ))}
            </div>
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
