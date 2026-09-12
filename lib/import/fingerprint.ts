import crypto from "node:crypto";

/**
 * Generate a deduplication fingerprint for a transaction.
 * Fingerprint = SHA-256(`{accountId}|{YYYY-MM-DD}|{amount:.2f}|{normalisedDesc}`) → hex[0..32]
 */
export function generateFingerprint(
  accountId: number,
  date: string,
  amount: number,
  normalisedDescription: string,
  occurrence = 1,
): string {
  // Keep the first occurrence compatible with previously imported transactions.
  const base = `${accountId}|${date}|${amount.toFixed(2)}|${normalisedDescription}`;
  const raw = occurrence === 1 ? base : `${base}|occurrence:${occurrence}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
