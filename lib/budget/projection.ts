/**
 * Schedule-aware month-end spend projection.
 *
 * A naive projection (`spent / daysElapsed * daysInMonth`) makes a month look far under
 * budget early on, because lumpy scheduled bills (rent, utilities) have not posted yet.
 * Instead we only extrapolate the *discretionary* run-rate and add the scheduled bills
 * that are still due this month. Scheduled items that have already been paid are split out
 * of the run-rate so they are not double-counted.
 */
export function computeScheduleAwareProjection(input: {
  /** Net expense outflow recorded so far this month (home currency). */
  totalSpent: number;
  /** All scheduled expense occurrences for the whole month (paid + still due). */
  scheduledFullMonth: number;
  /** Scheduled expense occurrences still due (strictly after today). */
  scheduledRemaining: number;
  daysElapsed: number;
  daysRemaining: number;
}): number {
  const {
    totalSpent,
    scheduledFullMonth,
    scheduledRemaining,
    daysElapsed,
    daysRemaining,
  } = input;

  const scheduledOccurred = Math.max(
    0,
    scheduledFullMonth - scheduledRemaining,
  );
  const discretionaryActual = Math.max(0, totalSpent - scheduledOccurred);
  const discretionaryRunRate =
    daysElapsed > 0 ? discretionaryActual / daysElapsed : 0;

  return totalSpent + scheduledRemaining + discretionaryRunRate * daysRemaining;
}
