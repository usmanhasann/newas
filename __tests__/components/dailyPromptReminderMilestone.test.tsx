/**
 * Daily check-in on a streak milestone (client revisions 10/14 p.28): when checking in today would
 * make the streak a milestone and there's no entry yet today, today's notification says "Today could
 * be day [X+1]. Take a minute to check in." instead of the rotating prompt. Once the user journals,
 * today goes back to its prompt. The home screen prompt and the rotation never change.
 * Only the OS layer, the prefs API and the stats API are faked. One render per file.
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyPromptReminder } from '@features/journal/hooks';
import { todaysPrompt } from '@features/journal/dailyPrompt';
import { DAILY_PROMPTS } from '@features/journal/promptRotation';
import { insightsKeys } from '@features/insights';
import { addDaysToLocalDate, localDateInTZ } from '@utils/date';

const mockFetchJournalStats = jest.fn();
jest.mock('@features/notifications/reminders', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve('granted')),
  canDeliver: (s: string) => s === 'granted' || s === 'provisional',
  scheduleDailyCheckIns: jest.fn(() => Promise.resolve(0)),
  cancelDailyCheckIns: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/notifications/api', () => ({
  fetchPrefs: jest.fn(() => Promise.resolve({ journaling_reminder: true, reminder_time: '21:00:00' })),
  updatePrefs: jest.fn(() => Promise.resolve()),
  registerDeviceToken: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: (today: string) => mockFetchJournalStats(today),
}));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));

const reminders = jest.requireMock('@features/notifications/reminders') as {
  scheduleDailyCheckIns: jest.Mock;
};
type Item = { key: string; at: Date; body: string };
const lastPlan = () => reminders.scheduleDailyCheckIns.mock.calls.at(-1)?.[0] as Item[] | undefined;

const today = localDateInTZ(new Date());
const yesterday = addDaysToLocalDate(today, -1);
const stats = (current_streak: number, last_entry_date: string) => ({
  entries_count: current_streak,
  current_streak,
  longest_streak: current_streak,
  last_entry_date,
  last_entry_on: last_entry_date,
  distinct_days: current_streak,
});

it('milestone eve: today’s check-in carries the milestone line until the user journals', async () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({
    remove: jest.fn(),
  })) as unknown as typeof AppState.addEventListener);
  await AsyncStorage.clear();
  // 29 days through yesterday, nothing yet today: checking in makes day 30.
  mockFetchJournalStats.mockResolvedValue(stats(29, yesterday));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  await renderHook(() => useDailyPromptReminder(), { wrapper });
  await waitFor(() =>
    expect(lastPlan()?.[0]?.body).toBe('Today could be day 30. Take a minute to check in.'),
  );
  const milestonePlan = lastPlan()!;
  expect(milestonePlan[0]!.key).toBe(today);
  // Every other day keeps its rotating prompt, and so does the home screen today.
  for (const item of milestonePlan.slice(1)) expect(DAILY_PROMPTS).toContain(item.body);
  const homePrompt = await todaysPrompt(today, true);
  expect(DAILY_PROMPTS).toContain(homePrompt);

  // The user journals today (day 30): today's check-in goes back to the prompt (31 isn't a milestone).
  const calls = reminders.scheduleDailyCheckIns.mock.calls.length;
  await act(async () => {
    qc.setQueryData(insightsKeys.stats('user-1', today), stats(30, today));
  });
  await waitFor(() => expect(reminders.scheduleDailyCheckIns.mock.calls.length).toBe(calls + 1));
  const after = lastPlan()!;
  expect(after[0]!.body).toBe(homePrompt);
  // The milestone day didn't move the rotation: every day keeps the same prompt as before.
  expect(after.slice(1).map((i) => [i.key, i.body])).toEqual(
    milestonePlan.slice(1).map((i) => [i.key, i.body]),
  );
  for (const item of after) expect(DAILY_PROMPTS).toContain(item.body);
});
