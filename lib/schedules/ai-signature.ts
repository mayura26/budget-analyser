export type ScheduleFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "yearly";

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function canonicalInternalName(input: string): string {
  return normalizeToken(input);
}

export function roundedAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function scheduleSuggestionSignature(input: {
  internalName: string;
  frequency: ScheduleFrequency;
  amount: number;
}): string {
  const name = canonicalInternalName(input.internalName);
  const amountRounded = roundedAmount(input.amount).toFixed(2);
  return `${name}|${input.frequency}|${amountRounded}`;
}
