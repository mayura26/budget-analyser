/**
 * Normalise a transaction description for deduplication and matching.
 * 1. Uppercase
 * 2. Strip embedded date patterns (DD/MM, MMM DD)
 * 3. Strip trailing reference codes after ` : ` or ` - `
 * 4. Collapse whitespace
 */
export function normaliseDescription(description: string): string {
  return normaliseDescriptionCore(description, false);
}

/**
 * Legacy dedupe normalisation kept for backwards-compatible fingerprint checks.
 * This matches historical behavior where 5+ digit runs were stripped.
 */
export function normaliseDescriptionLegacy(description: string): string {
  return normaliseDescriptionCore(description, true);
}

function normaliseDescriptionCore(
  description: string,
  stripLongDigitRuns: boolean,
): string {
  let s = description.toUpperCase();

  // Strip trailing reference codes after " : " or " - "
  s = s.replace(/\s+[:-]\s+[A-Z0-9#*/]+$/, "");

  // Strip embedded date patterns like 12/03 or JAN 12
  s = s.replace(/\b\d{1,2}\/\d{1,2}\b/g, "");
  s = s.replace(
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\b/gi,
    "",
  );

  if (stripLongDigitRuns) {
    // Historical behavior: strip card/terminal/reference numbers.
    s = s.replace(/\d{5,}/g, "");
  }

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Normalise a merchant name for matching pending -> settled rows.
 * Lowercases, strips legal suffixes and Australian state abbreviations,
 * removes punctuation, and collapses whitespace.
 */
export function normaliseMerchant(merchant: string | null | undefined): string {
  if (!merchant) return "";
  let s = merchant.toLowerCase();
  s = s.replace(/[.,/#!?$%^&*;:{}=_`~()'"\\[\]]/g, " ");
  s = s.replace(/\b(pty\s*ltd|pty|ltd|limited|inc|llc|co|corp|the)\b/g, " ");
  s = s.replace(/\b(nsw|vic|qld|wa|sa|tas|act|nt|aus|australia)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
