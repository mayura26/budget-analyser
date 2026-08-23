import assert from "node:assert";
import { test } from "node:test";
import {
  bankProfileFilenamePatterns,
  bankProfileMatchesFilename,
  detectBankProfile,
  filenameMatchesWildcard,
} from "./profiles";

test("filename wildcard matching is basename-only and case-insensitive", () => {
  assert.strictEqual(
    filenameMatchesWildcard("activity123.csv", "activity*.csv"),
    true,
  );
  assert.strictEqual(
    filenameMatchesWildcard("C:\\Downloads\\ACTIVITY-Aug.CSV", "activity*.csv"),
    true,
  );
  assert.strictEqual(
    filenameMatchesWildcard("statement.csv", "activity*.csv"),
    false,
  );
});

test("Amex profile can be detected from activity filename without headers", () => {
  const detected = detectBankProfile([], "activity2026.csv");
  assert.strictEqual(detected?.name, "Amex");
});

test("profile filename patterns are read from extra mappings", () => {
  const profile = {
    name: "Example",
    extraMappings: JSON.stringify({ filenamePatterns: ["foo*.csv"] }),
  };

  assert.deepStrictEqual(bankProfileFilenamePatterns(profile), ["foo*.csv"]);
  assert.strictEqual(bankProfileMatchesFilename(profile, "foo-jan.csv"), true);
  assert.strictEqual(bankProfileMatchesFilename(profile, "bar-jan.csv"), false);
});
