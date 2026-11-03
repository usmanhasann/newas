/**
 * Switching the daily check-in reminder on and then quickly off (audit 2026-09-30): the check-in
 * syncs run one at a time and each uses the LATEST setting, so the off always wins. Nothing stays
 * scheduled for someone who turned it off, and the prompt plan goes back to today only.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyPromptReminder } from '@features/journal/hooks';
import { DAILY_PROMPT_KEY } from '@features/journal/dailyPrompt';

let finishSchedule: () => void = () => {};
jest.mock('@features/notifications/reminders', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve('granted')),
  canDeliver: (s: string) => s === 'granted' || s === 'provisional',
  // Scheduling is slow: it only finishes when the test says so.
  scheduleDailyCheckIns: jest.fn(
    () =>
      new Promise<number>((resolve) => {
        finishSchedule = () => resolve(60);
      }),
  ),
  cancelDailyCheckIns: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/notifications/api', () => ({
  fetchPrefs: jest.fn(() => Promise.resolve({ journaling_reminder: true, reminder_time: '21:00:00' })),
  updatePrefs: jest.fn(() => Promise.resolve()),
  registerDeviceToken: jest.fn(() => Promise.resolve()),
}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));

const reminders = jest.requireMock('@features/notifications/reminders') as {
  scheduleDailyCheckIns: jest.Mock;
  cancelDailyCheckIns: jest.Mock;
};

it('on then quickly off: the off wins, nothing stays scheduled, the plan is back to today', async () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({
    remove: jest.fn(),
  })) as unknown as typeof AppState.addEventListener);
  await AsyncStorage.clear();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  await renderHook(() => useDailyPromptReminder(), { wrapper });
  await waitFor(() => expect(reminders.scheduleDailyCheckIns).toHaveBeenCalledTimes(1));

  // While the "on" run is still scheduling, the person switches the reminder off.
  await act(async () => {
    qc.setQueryData(['notif', 'prefs', 'user-1'], { journaling_reminder: false, reminder_time: '21:00:00' });
  });
  expect(reminders.cancelDailyCheckIns).not.toHaveBeenCalled(); // waits its turn

  await act(async () => {
    finishSchedule();
  });
  await waitFor(() => expect(reminders.cancelDailyCheckIns).toHaveBeenCalledTimes(1));
  // The cancel came AFTER the schedule, so the last word is "off".
  expect(reminders.cancelDailyCheckIns.mock.invocationCallOrder[0]).toBeGreaterThan(
    reminders.scheduleDailyCheckIns.mock.invocationCallOrder[0]!,
  );
  await waitFor(async () => {
    const saved = JSON.parse((await AsyncStorage.getItem(DAILY_PROMPT_KEY)) ?? '[]') as unknown[];
    expect(saved).toHaveLength(1);
  });
});
