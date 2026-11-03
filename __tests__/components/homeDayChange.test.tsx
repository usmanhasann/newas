/**
 * Home after midnight with the app left open (final check 2026-10-06): Today's Moods and the daily
 * prompt used the date from the last render, so a phone that stayed open overnight showed
 * yesterday's highlighted moods and prompt the next morning. Returning to the app now reads the new
 * day: Today's Moods asks for the new day's entries, and the prompt moves on.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDailyPrompt, useTodayMoods } from '@features/journal/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/notifications', () => ({
  useNotificationPrefs: () => ({ data: { journaling_reminder: false, reminder_time: '21:00:00' }, isError: false, fetchStatus: 'idle' }),
  canDeliver: () => false,
  cancelDailyCheckIns: jest.fn(),
  getNotificationPermission: jest.fn(),
  scheduleDailyCheckIns: jest.fn(),
}));
const mockMoodLists = jest.fn((_uid: string, date: string) =>
  Promise.resolve(date === '2026-10-05' ? [['calm']] : []),
);
jest.mock('@features/journal/api', () => ({
  getTodayMoodLists: (uid: string, date: string) => mockMoodLists(uid, date),
}));
const mockPrompt = jest.fn((today: string) => Promise.resolve(`prompt for ${today}`));
jest.mock('@features/journal/dailyPrompt', () => ({
  todaysPrompt: (today: string) => mockPrompt(today),
  planDailyPrompts: jest.fn(),
  trimDailyPlan: jest.fn(),
}));

it('moves Today’s Moods and the prompt to the new day when the app comes back after midnight', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    const prev = onChange;
    onChange = (s) => {
      prev(s);
      handler(s);
    };
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'],
    now: new Date('2026-10-05T12:00:00Z'), // mid-day UTC: the same date in any timezone
  });
  try {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => ({ moods: useTodayMoods(), prompt: useDailyPrompt() }), { wrapper });
    await waitFor(() => expect(result.current.moods).toEqual(['calm']));
    await waitFor(() => expect(result.current.prompt).toBe('prompt for 2026-10-05'));

    // Overnight in the background, back in the morning.
    jest.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    await act(async () => {
      onChange('active');
    });
    await waitFor(() => expect(mockMoodLists).toHaveBeenLastCalledWith('user-1', '2026-10-06'));
    await waitFor(() => expect(result.current.moods).toEqual([])); // yesterday's highlight is gone
    await waitFor(() => expect(result.current.prompt).toBe('prompt for 2026-10-06'));
  } finally {
    jest.useRealTimers();
  }
});
