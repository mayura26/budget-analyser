"use client";

import { useState } from "react";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { createAccountGroup } from "@/lib/actions/account-groups";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import type { Account, AccountGroup, BankProfile } from "@/types";

const COLORS = [
  "#6366f1", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#64748b",
];

export function AccountDialog({
  bankProfiles,
  groups = [],
  account,
}: {
  bankProfiles: BankProfile[];
  groups?: AccountGroup[];
  account?: Account;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    account?.groupId ? String(account.groupId) : "none"
  );
  const [newGroupName, setNewGroupName] = useState("");
  const isEdit = !!account;

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSelectedGroupId(account?.groupId ? String(account.groupId) : "none");
      setNewGroupName("");
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Pencil className="h-3 w-3" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setPending(true);
            setError(null);

            // If creating a new group inline, create it first
            let resolvedGroupId: string | null = null;
            if (selectedGroupId === "__new__") {
              if (!newGroupName.trim()) {
                setError("Group name is required");
                setPending(false);
                return;
              }
              const gfd = new FormData();
              gfd.set("name", newGroupName.trim());
              gfd.set("color", "#6366f1");
              const gResult = await createAccountGroup(null, gfd);
              if (!gResult.success) {
                setError(gResult.error);
                setPending(false);
                return;
              }
              resolvedGroupId = String(gResult.data.id);
            } else if (selectedGroupId !== "none") {
              resolvedGroupId = selectedGroupId;
            }

            if (resolvedGroupId) {
              fd.set("groupId", resolvedGroupId);
            }

            const result = isEdit
              ? await updateAccount(account!.id, null, fd)
              : await createAccount(null, fd);
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
            <Input name="name" defaultValue={account?.name} required />
          </div>

          <div className="space-y-2">
            <Label>Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">+ New group…</SelectItem>
              </SelectContent>
            </Select>
            {selectedGroupId === "__new__" && (
              <Input
                placeholder="Group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Bank Profile</Label>
            <Select name="bankProfileId" defaultValue={account?.bankProfileId ? String(account.bankProfileId) : undefined}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank" />
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
            <Label>Currency</Label>
            <Input name="currency" defaultValue={account?.currency ?? "AUD"} maxLength={3} />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <label key={color} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={color}
                    className="sr-only"
                    defaultChecked={
                      account?.color === color || (!account && color === COLORS[0])
                    }
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
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
