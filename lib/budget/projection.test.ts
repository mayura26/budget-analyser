import assert from "node:assert";
import { test } from "node:test";
import { computeScheduleAwareProjection } from "./projection";

test("includes scheduled bills still due, not just spent-so-far", () => {
  // Mid-month: $1,127 of discretionary spend, but $9,000 of rent/utilities still due.
  // Naive extrapolation (1127/6*30 ≈ 5635) would look fine; schedule-aware must be higher.
  const projected = computeScheduleAwareProjection({
    totalSpent: 1127,
    scheduledFullMonth: 9000,
    scheduledRemaining: 9000, // nothing paid yet
    daysElapsed: 6,
    daysRemaining: 24,
  });

  // spent + remaining scheduled + discretionary run-rate over the rest of the month
  const expected = 1127 + 9000 + (1127 / 6) * 24;
  assert.ok(
    Math.abs(projected - expected) < 0.01,
    `expected ${expected}, got ${projected}`,
  );
  assert.ok(
    projected >= 1127 + 9000,
    "projection must include scheduled bills still due",
  );
});

test("does not double-count scheduled bills already paid", () => {
  // Same $9,000 rent, but it has already posted (remaining = 0) and is part of totalSpent.
  // Only the $300 of discretionary spend should be extrapolated, not the rent.
  const projected = computeScheduleAwareProjection({
    totalSpent: 9300,
    scheduledFullMonth: 9000,
    scheduledRemaining: 0,
    daysElapsed: 10,
    daysRemaining: 20,
  });

  const discretionary = 9300 - 9000;
  const expected = 9300 + 0 + (discretionary / 10) * 20;
  assert.ok(
    Math.abs(projected - expected) < 0.01,
    `expected ${expected}, got ${projected}`,
  );
  // Must be far below treating the whole $9,300 as a daily run-rate (which would be ~27,900).
  assert.ok(
    projected < 12000,
    "paid rent must not be extrapolated as run-rate",
  );
});

test("future month (no days elapsed) projects the full scheduled total", () => {
  const projected = computeScheduleAwareProjection({
    totalSpent: 0,
    scheduledFullMonth: 4200,
    scheduledRemaining: 4200,
    daysElapsed: 0,
    daysRemaining: 30,
  });
  assert.strictEqual(projected, 4200);
});

test("clamps over-modelled schedules so discretionary spend never goes negative", () => {
  // Scheduled modelled higher than what actually posted (e.g. bill not yet matched).
  const projected = computeScheduleAwareProjection({
    totalSpent: 100,
    scheduledFullMonth: 500,
    scheduledRemaining: 0, // all "occurred" per the schedule, but only $100 actually spent
    daysElapsed: 15,
    daysRemaining: 15,
  });
  // discretionaryActual clamps to 0 → projection is just what was spent.
  assert.strictEqual(projected, 100);
});
