"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function normalizeHexInput(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const withHash = s.startsWith("#") ? s : `#${s}`;
  const m = withHash.match(/^#([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function CategoryColorField({
  defaultValue,
  disabled,
  name = "color",
}: {
  defaultValue: string;
  disabled?: boolean;
  name?: string;
}) {
  const [color, setColor] = useState(() => defaultValue);
  const [hexInput, setHexInput] = useState(() => defaultValue);

  useEffect(() => {
    setColor(defaultValue);
    setHexInput(defaultValue);
  }, [defaultValue]);

  return (
    <div className="space-y-2">
      <Label>Colour</Label>
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={color} readOnly />
        <Input
          type="color"
          className={cn(
            "h-9 w-14 shrink-0 p-1 cursor-pointer",
            disabled && "opacity-50 pointer-events-none",
          )}
          value={color}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setColor(v);
            setHexInput(v);
          }}
          aria-label="Pick colour"
        />
        <Input
          type="text"
          className="font-mono text-sm flex-1"
          value={hexInput}
          disabled={disabled}
          spellCheck={false}
          placeholder="#6366f1"
          onChange={(e) => {
            const v = e.target.value;
            setHexInput(v);
            const n = normalizeHexInput(v);
            if (n) setColor(n);
          }}
          onBlur={() => {
            const n = normalizeHexInput(hexInput);
            if (n) {
              setColor(n);
              setHexInput(n);
            } else {
              setHexInput(color);
            }
          }}
        />
      </div>
    </div>
  );
}
