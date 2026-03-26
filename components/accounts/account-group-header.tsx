"use client";

import { useState, useRef } from "react";
import { updateAccountGroup, deleteAccountGroup } from "@/lib/actions/account-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Check, X } from "lucide-react";
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
      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />

      {renaming ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") { setName(group.name); setRenaming(false); }
            }}
            className="h-6 text-sm font-semibold px-1 py-0 w-40"
            autoFocus
            disabled={saving}
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveRename} disabled={saving}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setName(group.name); setRenaming(false); }}>
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
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete group?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will remove the <strong>{group.name}</strong> group. The accounts inside will become ungrouped.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
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
