"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ACCOUNT_GROUP_SWATCH_COLORS } from "@/lib/accounts/account-group-swatch-colors";
import {
  deleteAccountGroup,
  updateAccountGroup,
} from "@/lib/actions/account-groups";
import type { AccountGroup } from "@/types";

export function AccountGroupHeader({
  group,
  accountCount,
}: {
  group: AccountGroup;
  accountCount: number;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function saveRename() {
    if (!name.trim() || name.trim() === group.name) {
      setName(group.name);
      setRenaming(false);
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("color", group.color);
    await updateAccountGroup(group.id, null, fd);
    setSaving(false);
    setRenaming(false);
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow] hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: group.color }}
            aria-label="Change group colour"
            disabled={renaming}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Group colour
          </p>
          <div className="flex max-w-[220px] flex-wrap gap-2">
            {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={colorSaving}
                className="h-7 w-7 rounded-full ring-2 ring-offset-2 ring-transparent transition-[box-shadow] hover:ring-foreground/30 disabled:opacity-50"
                style={{
                  backgroundColor: color,
                  boxShadow:
                    color === group.color
                      ? "0 0 0 2px hsl(var(--foreground))"
                      : undefined,
                }}
                aria-label={`Set colour ${color}`}
                aria-current={color === group.color}
                onClick={async () => {
                  if (color === group.color) {
                    setColorPickerOpen(false);
                    return;
                  }
                  setColorSaving(true);
                  const fd = new FormData();
                  fd.set("name", group.name);
                  fd.set("color", color);
                  await updateAccountGroup(group.id, null, fd);
                  setColorSaving(false);
                  setColorPickerOpen(false);
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {renaming ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") {
                setName(group.name);
                setRenaming(false);
              }
            }}
            className="h-6 text-sm font-semibold px-1 py-0 w-40"
            autoFocus
            disabled={saving}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={saveRename}
            disabled={saving}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setName(group.name);
              setRenaming(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {group.name}
          <span className="font-normal ml-2 text-xs">({accountCount})</span>
        </span>
      )}

      {!renaming && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setRenaming(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete group?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will remove the <strong>{group.name}</strong> group. The
                accounts inside will become ungrouped.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    await deleteAccountGroup(group.id);
                    setDeleteOpen(false);
                  }}
                >
                  {deleting ? "Deleting…" : "Delete group"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="flex-1 h-px bg-border ml-1" />
    </div>
  );
}
