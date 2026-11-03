/**
 * The engagement gate for the notification re-prompt. The client's rule is deliberately
 * two-dimensional — 5+ entries AND 3+ separate local days — precisely so that a burst of
 * entries in one sitting does NOT count as engaged. These cases pin both edges.
 */
import {
  meetsRepromptEngagement,
  REPROMPT_MIN_ENTRIES,
  REPROMPT_MIN_DAYS,
} from '@features/notifications/nudge';

describe('notification re-prompt — engagement gate', () => {
  it('uses the thresholds the client specified', () => {
    expect(REPROMPT_MIN_ENTRIES).toBe(5);
    expect(REPROMPT_MIN_DAYS).toBe(3);
  });

  it('qualifies at exactly the threshold', () => {
    expect(meetsRepromptEngagement({ entries_count: 5, distinct_days: 3 })).toBe(true);
  });

  it('REJECTS five entries logged in a single sitting — the case the rule exists for', () => {
    expect(meetsRepromptEngagement({ entries_count: 5, distinct_days: 1 })).toBe(false);
    expect(meetsRepromptEngagement({ entries_count: 20, distinct_days: 1 })).toBe(false);
  });

  it('rejects enough days but too few entries', () => {
    // One entry on each of four days: spread out, but not yet 5 entries.
    expect(meetsRepromptEngagement({ entries_count: 4, distinct_days: 4 })).toBe(false);
  });

  it('rejects one short on either axis', () => {
    expect(meetsRepromptEngagement({ entries_count: 4, distinct_days: 3 })).toBe(false);
    expect(meetsRepromptEngagement({ entries_count: 5, distinct_days: 2 })).toBe(false);
  });

  it('qualifies comfortably past the threshold', () => {
    expect(meetsRepromptEngagement({ entries_count: 12, distinct_days: 7 })).toBe(true);
  });

  it('never qualifies on missing stats (loading, or a deploy without the migration)', () => {
    expect(meetsRepromptEngagement(null)).toBe(false);
    expect(meetsRepromptEngagement(undefined)).toBe(false);
    // distinct_days reads 0 until the migration lands — must fail closed, never misfire.
    expect(meetsRepromptEngagement({ entries_count: 50, distinct_days: 0 })).toBe(false);
  });
});
