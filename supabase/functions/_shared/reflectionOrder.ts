// Which due reflections generate-reflections writes first. No I/O / no Deno APIs, so the edge
// function and the Jest test share the SAME source.
//
// Insights shows the NEWEST finished period of each length, and the 9 AM recap push announces that
// same period, so the newest due period of EACH type goes first, then everything else newest first.
// Sorting all types together by date alone could leave a newly unlocked Yearly behind a dozen newer
// weekly and monthly periods (the per call cap), so its "recap is ready" push would go out before
// the reflection exists and the card would wait on later calls.

export interface DuePeriod {
  type: string;
  period_start: string;
}

/**
 * The periods to write in this call, at most `max`: each type's newest first, then newest first.
 * Generic over the row, so the caller gets its own rows back (with period_end and anything else).
 * Pass the row type when `due` is untyped: inferred from `any`, T would fall back to DuePeriod.
 */
export function orderDuePeriods<T extends DuePeriod>(due: readonly T[], max: number): T[] {
  const newestFirst = [...due].sort((a, b) =>
    String(b.period_start).localeCompare(String(a.period_start)),
  );
  const seen = new Set<string>();
  const heads: T[] = [];
  const rest: T[] = [];
  for (const p of newestFirst) {
    if (seen.has(p.type)) {
      rest.push(p);
    } else {
      seen.add(p.type);
      heads.push(p);
    }
  }
  return [...heads, ...rest].slice(0, Math.max(0, max));
}
