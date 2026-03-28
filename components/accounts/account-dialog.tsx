"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [useCustomColor, setUseCustomColor] = useState(
    () => !!(account?.groupId && account?.colorCustom),
  );
  const [customColor, setCustomColor] = useState(
    () => account?.color ?? ACCOUNT_GROUP_SWATCH_COLORS[0],
  );
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

  const inGroup = selectedGroupId !== "none";
  const showGroupDerivedColor = previewDerivedColor != null;

  const colorFieldValue = useMemo(() => {
    if (!inGroup) return customColor;
    if (useCustomColor) return customColor;
    return previewDerivedColor ?? "#6366f1";
  }, [inGroup, useCustomColor, customColor, previewDerivedColor]);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setUseCustomColor(!!(account.groupId && account.colorCustom));
      setCustomColor(account.color);
    } else {
      setUseCustomColor(false);
      setCustomColor(ACCOUNT_GROUP_SWATCH_COLORS[0]);
    }
  }, [open, account]);

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

            const isGrouped = resolvedGroupId != null;
            fd.set("colorCustom", isGrouped && useCustomColor ? "1" : "0");
            fd.set("color", colorFieldValue);

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
            <Label>Colour</Label>
            {showGroupDerivedColor && inGroup ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Colours are derived from the group by default. Check
                  &quot;Pick my own colour&quot; to choose a swatch.
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomColor}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (on) {
                        setUseCustomColor(true);
                        setCustomColor(
                          previewDerivedColor ?? customColor ?? "#6366f1",
                        );
                      } else {
                        setUseCustomColor(false);
                      }
                    }}
                    className="rounded border-border"
                    aria-label="Pick my own colour"
                  />
                  <span>Pick my own colour</span>
                </label>
                {!useCustomColor && previewDerivedColor && (
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: previewDerivedColor }}
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {previewDerivedColor}
                    </span>
                  </div>
                )}
                {useCustomColor && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCustomColor(color)}
                        className="h-7 w-7 rounded-full ring-2 ring-offset-2 ring-transparent transition-[box-shadow] hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{
                          backgroundColor: color,
                          boxShadow:
                            customColor === color
                              ? "0 0 0 2px hsl(var(--foreground))"
                              : undefined,
                        }}
                        aria-label={`Colour ${color}`}
                        aria-pressed={customColor === color}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCustomColor(color)}
                    className="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-transparent transition-[box-shadow] hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        customColor === color
                          ? "0 0 0 2px hsl(var(--foreground))"
                          : undefined,
                    }}
                    aria-label={`Colour ${color}`}
                    aria-pressed={customColor === color}
                  />
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
