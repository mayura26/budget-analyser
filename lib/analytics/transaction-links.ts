/**
 * Deep-link to the transactions list with date bounds (and optional filters).
 * Requires `from` / `to` support on `/transactions` (YYYY-MM-DD).
 */
export function transactionsInRangeUrl(opts: {
  from: string;
  to: string;
  accountId?: number;
  categoryId?: number | "none";
}): string {
  const p = new URLSearchParams();
  p.set("from", opts.from);
  p.set("to", opts.to);
  if (opts.accountId != null) p.set("accountId", String(opts.accountId));
  if (opts.categoryId === "none") p.set("categoryId", "none");
  else if (opts.categoryId != null)
    p.set("categoryId", String(opts.categoryId));
  return `/transactions?${p.toString()}`;
}
