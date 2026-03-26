import crypto from "crypto";

/**
 * Generate a deduplication fingerprint for a transaction.
 * Fingerprint = SHA-256(`{accountId}|{YYYY-MM-DD}|{amount:.2f}|{normalisedDesc}`) → hex[0..32]
 */
export function generateFingerprint(
  accountId: number,
  date: string,
  amount: number,
  normalisedDescription: string
): string {
  const raw = `${accountId}|${date}|${amount.toFixed(2)}|${normalisedDescription}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
