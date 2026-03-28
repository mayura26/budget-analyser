"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_GROUP_SWATCH_COLORS } from "@/lib/accounts/account-group-swatch-colors";

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

function toColorInputValue(hex: string): string {
  const m = HEX6.exec(hex.trim());
  if (!m) return "#6366f1";
  return `#${m[1].toLowerCase()}`;
}

type AccountColourPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  /** Derived variants (e.g. from `listDerivedAccountMemberColors`) */
  suggestions?: string[];
  suggestionsLabel?: string;
  /** Show preset bank swatches */
  showPresets?: boolean;
  presetsLabel?: string;
  /** Smaller swatches in tight dialogs */
  swatchSize?: "sm" | "md";
};

export function AccountColourPicker({
  value,
  onChange,
  suggestions,
  suggestionsLabel = "Suggested from group colour",
  showPresets = true,
  presetsLabel = "Quick picks",
  swatchSize = "md",
}: AccountColourPickerProps) {
  const [hexDraft, setHexDraft] = useState(() => toColorInputValue(value));

  const colorInputValue = useMemo(() => toColorInputValue(value), [value]);

  useEffect(() => {
    setHexDraft(toColorInputValue(value));
  }, [value]);

  const swatchClass =
    swatchSize === "sm"
      ? "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-transparent transition-[box-shadow] hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-transparent transition-[box-shadow] hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  function applyHex(raw: string) {
    const m = HEX6.exec(raw.trim());
    if (!m) return;
    const next = `#${m[1].toLowerCase()}`;
    setHexDraft(next);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="sr-only">Colour picker</Label>
        <input
          type="color"
          value={colorInputValue}
          onChange={(e) => {
            applyHex(e.target.value);
          }}
          className="h-9 w-14 cursor-pointer rounded-md border border-input bg-background p-0.5 shadow-xs"
          aria-label="Open colour picker"
        />
        <Input
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => applyHex(hexDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyHex(hexDraft);
          }}
          placeholder="#6366f1"
          className="h-9 max-w-[8.5rem] font-mono text-xs"
          spellCheck={false}
          aria-label="Colour as hex"
        />
      </div>

      {suggestions != null && suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {suggestionsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  setHexDraft(color);
                  onChange(color);
                }}
                className={swatchClass}
                style={{
                  backgroundColor: color,
                  boxShadow:
                    toColorInputValue(value) === toColorInputValue(color)
                      ? "0 0 0 2px hsl(var(--foreground))"
                      : undefined,
                }}
                aria-label={`Suggested colour ${color}`}
                aria-pressed={
                  toColorInputValue(value) === toColorInputValue(color)
                }
              />
            ))}
          </div>
        </div>
      )}

      {showPresets && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {presetsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_GROUP_SWATCH_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  setHexDraft(color);
                  onChange(color);
                }}
                className={swatchClass}
                style={{
                  backgroundColor: color,
                  boxShadow:
                    toColorInputValue(value) === toColorInputValue(color)
                      ? "0 0 0 2px hsl(var(--foreground))"
                      : undefined,
                }}
                aria-label={`Colour ${color}`}
                aria-pressed={
                  toColorInputValue(value) === toColorInputValue(color)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
