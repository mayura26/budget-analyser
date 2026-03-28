/**
 * Split stored category `name` into a primary title and optional parenthetical subtext.
 * Uses the last "(" … ")" pair that closes at the end of the string.
 */
export function parseCategoryDisplayName(name: string): {
  title: string;
  subtext: string | null;
} {
  const trimmed = name.trim();
  const lastOpen = trimmed.lastIndexOf("(");
  const lastClose = trimmed.lastIndexOf(")");
  if (
    lastOpen === -1 ||
    lastClose === -1 ||
    lastClose !== trimmed.length - 1 ||
    lastOpen >= lastClose
  ) {
    return { title: trimmed, subtext: null };
  }
  const before = trimmed.slice(0, lastOpen).trim();
  const inner = trimmed.slice(lastOpen + 1, lastClose).trim();
  if (!before) {
    return { title: trimmed, subtext: null };
  }
  return { title: before, subtext: inner || null };
}

/** Inverse of {@link parseCategoryDisplayName}: build stored `name` from title and optional subtext. */
export function serializeCategoryDisplayName(
  title: string,
  subtext?: string | null,
): string {
  const t = title.trim();
  if (!t) return "";
  const s = subtext?.trim();
  if (!s) return t;
  return `${t} (${s})`;
}

/** Plain-text label for native `<option>` (no JSX). */
export function formatCategoryOptionPlainText(name: string): string {
  const { title, subtext } = parseCategoryDisplayName(name);
  return subtext ? `${title} — ${subtext}` : title;
}

/** Single line for AI prompts: title, details, group, type. */
export function formatCategoryForAI(
  id: number,
  name: string,
  parentName: string | undefined,
  type: string,
): string {
  const { title, subtext } = parseCategoryDisplayName(name);
  const details = subtext ?? "—";
  const group = parentName ?? "—";
  return `${id}: ${title} — details: ${details} — group: ${group} — type: ${type}`;
}
