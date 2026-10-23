/**
 * Calendar-day arithmetic for "YYYY-MM-DD" date strings, anchored to UTC
 * so the result never depends on the server process's own local timezone
 * setting. Both dashboard.routes.ts and warranties.routes.ts call this
 * same function for "days remaining" so the two views can never disagree
 * about the same warranty_expiration value.
 */
function utcDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Days from today (UTC calendar date) until dateStr. Negative if in the past. */
export function daysUntil(dateStr: string): number {
  const now = new Date();
  const todayNum = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  return utcDayNumber(dateStr) - todayNum;
}
