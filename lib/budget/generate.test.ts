import assert from "node:assert";
import { test } from "node:test";
import { buildBalancePoints } from "./generate";

test("balance points advance across daylight-saving date boundaries", () => {
  const points = buildBalancePoints([], 1200, "2026-10-03", "2026-10-05");

  assert.equal(points.at(-1)?.isoDate, "2026-10-05");
});
