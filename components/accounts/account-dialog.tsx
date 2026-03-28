"use client";

import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_GROUP_SWATCH_COLORS } from "@/lib/accounts/account-group-swatch-colors";
import { deriveAccountGroupMemberColor } from "@/lib/accounts/account-member-colors";
import { createAccountGroup } from "@/lib/actions/account-groups";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import type { Account, AccountGroup, BankProfile } from "@/types";

const INLINE_NEW_GROUP_COLOR = "#6366f1";

export function AccountDialog({
  bankProfiles,
  groups = [],
  groupAccountIdsByGroup = {},
  account,
}: {
  bankProfiles: BankProfile[];
  groups?: AccountGroup[];
  /** Sorted account ids per group (for derived colour preview). */
  groupAccountIdsByGroup?: Record<number, number[]>;
  account?: Account;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    account?.groupId ? String(account.groupId) : "none",
  );
  const [newGroupName, setNewGroupName] = useState("");
  const isEdit = !!account;

  const previewDerivedColor = useMemo((): string | null => {
    if (selectedGroupId === "none") return null;
    if (selectedGroupId === "__new__") {
      return deriveAccountGroupMemberColor(INLINE_NEW_GROUP_COLOR, 0);
    }
    const gid = Number(selectedGroupId);
    const g = groups.find((x) => x.id === gid);
    if (!g) return null;
    const ids = groupAccountIdsByGroup[gid] ?? [];
    if (isEdit && account) {
      const idx = ids.indexOf(account.id);
      if (idx >= 0) {
        return deriveAccountGroupMemberColor(g.color, idx);
      }
      return deriveAccountGroupMemberColor(g.color, ids.length);
    }
    return deriveAccountGroupMemberColor(g.color, ids.length);
  }, [selectedGroupId, groups, groupAccountIdsByGroup, isEdit, account]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSelectedGroupId(account?.groupId ? String(account.groupId) : "none");
      setNewGroupName("");
      setError(null);
    }
  }

  const showGroupDerivedColor = previewDerivedColor != null;

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
              gfd.set("color", INLINE_NEW_GROUP_COLOR);
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
            } else {
              fd.delete("groupId");
            }

            const result =
              isEdit && account
                ? await updateAccount(account.id, null, fd)
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
            <Select
              name="bankProfileId"
              defaultValue={
                account?.bankProfileId
                  ? String(account.bankProfileId)
                  : undefined
              }
            >
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
            <Input
              name="currency"
              defaultValue={account?.currency ?? "AUD"}
              maxLength={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            {showGroupDerivedColor && previewDerivedColor ? (
              <>
                <p className="text-xs text-muted-foreground">
                  This account uses a tint derived from the group colour. Change
                  the group colour to shift every account in the group.
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: previewDerivedColor }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {previewDerivedColor}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
                  <label key={color} className="cursor-pointer">
                    <input
                      type="radio"
                      name="color"
                      value={color}
                      className="sr-only"
                      defaultChecked={
                        account?.color === color ||
                        (!account && color === ACCOUNT_GROUP_SWATCH_COLORS[0])
                      }
                    />
                    <div
                      className="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-transparent has-[:checked]:ring-foreground"
                      style={{ backgroundColor: color }}
                    />
                  </label>
                ))}
              </div>
            )}
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
