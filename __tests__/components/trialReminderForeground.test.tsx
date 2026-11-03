/**
 * The trial reminder the paywall promises (audit 2026-09-30): if notifications weren't allowed when
 * the trial started, it used to never be scheduled. Now it waits, and is scheduled as soon as the
 * app comes back to the foreground with notifications allowed (turned on in the app or in the
 * phone's Settings). It fires 2 days before the end, the paywall's "Day 3".
 * One render per file (React 19 leaks across sibling renders).
 */
import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTrialReminderSync } from '@features/onboarding/hooks';

const mockPerm = jest.fn();
const mockSchedule = jest.fn((..._a: unknown[]) => Promise.resolve('ic-trial-day4'));
jest.mock('@features/notifications', () => ({
  scheduleOneOff: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduled: jest.fn(() => Promise.resolve()),
  getNotificationPermission: () => mockPerm(),
  canDeliver: (s: string) => s === 'granted' || s === 'provisional',
  TRIAL_REMINDER_ID: 'ic-trial-day4',
}));
jest.mock('@features/subscription', () => ({
  useSubscriptionView: () => ({
    view: { isTrialing: true, trialEndsAt: '2026-10-05T09:00:00.000Z', plan: 'yearly' },
  }),
  priceWithPeriod: () => '$29.99/year',
  usePlanPrices: () => jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
}));
jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: undefined }),
  profileKeys: { me: () => ['profile'] },
}));

it('schedules the reminder once notifications are allowed, on the next foreground', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    onChange = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);

  mockPerm.mockResolvedValue('denied');
  await renderHook(() => useTrialReminderSync());
  await waitFor(() => expect(mockPerm).toHaveBeenCalledTimes(1));
  expect(mockSchedule).not.toHaveBeenCalled();

  // Turned on in Settings; back to the app.
  mockPerm.mockResolvedValue('granted');
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));
  const [id, at, content] = mockSchedule.mock.calls[0]! as [
    string,
    Date,
    { title: string; body: string },
  ];
  expect(id).toBe('ic-trial-day4');
  // A 5-day trial started Sep 30 09:00 UTC: Day 3 of the paywall timeline (Today, Day 3, Day 5).
  expect(at.toISOString()).toBe('2026-10-03T09:00:00.000Z'); // 2 days before the end
  expect(content.title).toBe('Your free trial ends in 2 days.'); // client 10/14 p.36, exact
  expect(content.body).toContain('$29.99/year');
  expect(content.body).toContain('Profile → Subscription');

  // Already scheduled for this trial: later foregrounds change nothing.
  await act(async () => {
    onChange('active');
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(mockSchedule).toHaveBeenCalledTimes(1);
});
