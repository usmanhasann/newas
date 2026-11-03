/**
 * Day 3 trial reminder (client 10/14 p.36): the paywall timeline promises "We remind you" on Day 3
 * (Today, Day 3, Day 5), and the push reads exactly "Your free trial ends in 2 days." The reminder
 * is scheduled from the server's trial end time, so this pins the timing and the words together:
 * it fires on Day 3 of the 5-day trial, when exactly 2 days are left.
 */
import { trialReminderFireAt, trialReminderMessage } from '@features/onboarding/copy';
import { TRIAL_DAYS } from '@features/subscription/pricing';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Day 3 trial reminder', () => {
  it('fires on the paywall’s Day 3 of the 5-day trial, with 2 days left', () => {
    expect(TRIAL_DAYS).toBe(5);
    const startedAt = Date.parse('2026-10-20T15:42:00.000Z');
    const endsAt = startedAt + TRIAL_DAYS * DAY_MS; // start_trial: now() + interval '5 days'
    const fireAt = trialReminderFireAt(endsAt);

    // "Day 3" on the paywall timeline is Day {TRIAL_DAYS - 2} counted from "Today".
    expect(fireAt - startedAt).toBe((TRIAL_DAYS - 2) * DAY_MS);
    // ...which leaves exactly the 2 days the notification promises.
    expect(endsAt - fireAt).toBe(2 * DAY_MS);
  });

  it('shows the client’s exact sentence as the notification title', () => {
    const { title, body } = trialReminderMessage({
      priceLabel: '$59.99/year',
      renewalDateLabel: 'Oct 25, 2026',
    });
    expect(title).toBe('Your free trial ends in 2 days.');
    // Renewal terms stay in the body: date, amount, and where to cancel.
    expect(body).toContain('Oct 25, 2026');
    expect(body).toContain('$59.99/year');
    expect(body).toContain('cancel anytime in Profile → Subscription.');
    // No dash punctuation in user-facing copy.
    expect(`${title} ${body}`).not.toMatch(/[–—]| - /);
  });
});
