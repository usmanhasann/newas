/**
 * Engagement gate for the notification re-prompt (client rule): a user qualifies once they
 * have logged at least REPROMPT_MIN_ENTRIES entries spread over at least REPROMPT_MIN_DAYS
 * SEPARATE local calendar days. Both conditions must hold — five entries in one sitting is
 * explicitly not "engaged", which is the whole reason a flat entry count wasn't enough.
 *
 * Pure + dependency-free so the thresholds are unit-testable without a database or a render.
 */

export const REPROMPT_MIN_ENTRIES = 5;
export const REPROMPT_MIN_DAYS = 3;

export interface EngagementStats {
  entries_count: number;
  /** Separate local calendar days with an entry — NOT the entry count. */
  distinct_days: number;
}

export function meetsRepromptEngagement(
  stats: EngagementStats | null | undefined,
): boolean {
  if (!stats) return false;
  return (
    stats.entries_count >= REPROMPT_MIN_ENTRIES &&
    stats.distinct_days >= REPROMPT_MIN_DAYS
  );
}
