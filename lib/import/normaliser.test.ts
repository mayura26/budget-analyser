import assert from "node:assert";
import { test } from "node:test";
import { generateFingerprint } from "./fingerprint";
import { normaliseDescription } from "./normaliser";

test("normaliseDescription preserves trailing numeric references", () => {
  const base = "DIRECT DEBIT 502574 AUSTRALIAN SALAR NSW";
  const d1 = normaliseDescription(`${base}236507`);
  const d2 = normaliseDescription(`${base}236506`);
  const d3 = normaliseDescription(`${base}236505`);

  assert.notStrictEqual(d1, d2);
  assert.notStrictEqual(d1, d3);
  assert.notStrictEqual(d2, d3);
});

test("fingerprints differ for same txn with different numeric suffixes", () => {
  const accountId = 1;
  const date = "2026-05-25";
  const amount = -134.75;
  const base = "DIRECT DEBIT 502574 AUSTRALIAN SALAR NSW";

  const f1 = generateFingerprint(
    accountId,
    date,
    amount,
    normaliseDescription(`${base}236507`),
  );
  const f2 = generateFingerprint(
    accountId,
    date,
    amount,
    normaliseDescription(`${base}236506`),
  );
  const f3 = generateFingerprint(
    accountId,
    date,
    amount,
    normaliseDescription(`${base}236505`),
  );

  assert.notStrictEqual(f1, f2);
  assert.notStrictEqual(f1, f3);
  assert.notStrictEqual(f2, f3);
});
