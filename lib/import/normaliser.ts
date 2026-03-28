/**
 * Normalise a transaction description for deduplication and matching.
 * 1. Uppercase
 * 2. Strip card/terminal numbers (5+ digit sequences)
 * 3. Strip embedded date patterns (DD/MM, MMM DD)
 * 4. Strip trailing reference codes after ` : ` or ` - `
 * 5. Collapse whitespace
 */
export function normaliseDescription(description: string): string {
  let s = description.toUpperCase();

  // Strip trailing reference codes after " : " or " - "
  s = s.replace(/\s+[:-]\s+[A-Z0-9#*/]+$/, "");

  // Strip embedded date patterns like 12/03 or JAN 12
  s = s.replace(/\b\d{1,2}\/\d{1,2}\b/g, "");
  s = s.replace(
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\b/gi,
    "",
  );

  // Strip card/terminal numbers (5+ consecutive digits)
  s = s.replace(/\d{5,}/g, "");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
