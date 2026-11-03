/**
 * Copy for the 9 AM "your recap is ready" push (recap-notifications). Each recap names itself the
 * way the Notifications page does and says what's in it — the mood breakdown and the reflection.
 */
import {
  groupRecapClaims,
  recapPushCopy,
  recapPushCopyFor,
  recapPushData,
} from '../supabase/functions/_shared/recapPush';

describe('recapPushCopy', () => {
  it('announces each recap with its own period', () => {
    expect(recapPushCopy('weekly')).toEqual({
      title: 'Your Weekly Recap is ready',
      body: 'See your mood breakdown and written reflection for the past week.',
    });
    expect(recapPushCopy('monthly')).toEqual({
      title: 'Your Monthly Recap is ready',
      body: 'See your mood breakdown and written reflection for the past month.',
    });
    expect(recapPushCopy('yearly')).toEqual({
      title: 'Your Yearly Recap is ready',
      body: 'See your mood breakdown and written reflection for the past year.',
    });
  });
});

/**
 * Client revisions 10/14 p.9: several reflections ready the same morning go out as ONE notification
 * ("Your weekly and monthly reflections are ready."), and tapping it opens Insights on the exact
 * period it announced.
 */
describe('one notification for several reflections', () => {
  it('keeps the single recap copy when only one is ready', () => {
    expect(recapPushCopyFor(['monthly'])).toEqual(recapPushCopy('monthly'));
  });

  it('names every combination, in order, word for word', () => {
    expect(recapPushCopyFor(['weekly', 'monthly']).title).toBe(
      'Your weekly and monthly reflections are ready.',
    );
    expect(recapPushCopyFor(['monthly', 'weekly']).title).toBe(
      'Your weekly and monthly reflections are ready.',
    );
    expect(recapPushCopyFor(['weekly', 'yearly']).title).toBe(
      'Your weekly and yearly reflections are ready.',
    );
    expect(recapPushCopyFor(['yearly', 'monthly']).title).toBe(
      'Your monthly and yearly reflections are ready.',
    );
    expect(recapPushCopyFor(['yearly', 'weekly', 'monthly'])).toEqual({
      title: 'Your weekly, monthly, and yearly reflections are ready.',
      body: 'See your mood breakdowns and written reflections for the past week, month, and year.',
    });
    expect(recapPushCopyFor(['weekly', 'monthly']).body).toBe(
      'See your mood breakdowns and written reflections for the past week and month.',
    );
  });

  it('groups a run’s claims into one push per person', () => {
    const grouped = groupRecapClaims([
      { user_id: 'u1', type: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30' },
      { user_id: 'u2', type: 'weekly', period_start: '2026-09-24', period_end: '2026-09-30' },
      { user_id: 'u1', type: 'weekly', period_start: '2026-09-24', period_end: '2026-09-30' },
      { user_id: 'u1', type: 'weekly', period_start: '2026-09-24', period_end: '2026-09-30' },
    ]);
    expect([...grouped.keys()]).toEqual(['u1', 'u2']);
    expect(grouped.get('u1')!.map((c) => c.type)).toEqual(['weekly', 'monthly']);
    expect(grouped.get('u2')!.map((c) => c.type)).toEqual(['weekly']);
  });

  it('carries the recap and its exact period, so a late tap opens that period', () => {
    expect(
      recapPushData([
        { user_id: 'u1', type: 'monthly', period_start: '2026-09-01' },
        { user_id: 'u1', type: 'weekly', period_start: '2026-09-24' },
      ]),
    ).toEqual({
      type: 'recap',
      recap_type: 'weekly',
      recap_types: 'weekly,monthly',
      period_start: '2026-09-24',
    });
    expect(recapPushData([{ user_id: 'u1', type: 'yearly', period_start: '2025-10-01' }])).toEqual(
      { type: 'recap', recap_type: 'yearly', recap_types: 'yearly', period_start: '2025-10-01' },
    );
  });
});
