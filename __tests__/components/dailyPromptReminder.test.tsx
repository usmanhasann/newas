/**
 * The daily check-in notification (client spec 2026-09-29): title "Your daily check-in", body = THAT
 * day's rotating prompt, the same pick the home screen shows (one shared daily pick, never two
 * rotations). With the reminder on, the rotation moves every calendar day, so each upcoming day is
 * scheduled ahead with its own prompt. Off, nothing is scheduled.
 *
 * Only the OS layer (reminders) and the prefs API are faked; the hook, the prefs query, the rotation
 * and its storage are real. Carried over from the old sync test: a denied permission never loses the
 * chosen time, and a cold start never cancels a live reminder.
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyPromptReminder } from '@features/journal/hooks';
import { todaysPrompt } from '@features/journal/dailyPrompt';
import { DAILY_PROMPTS, PLAN_DAYS } from '@features/journal/promptRotation';

jest.mock('@features/notifications/reminders', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve('granted')),
  canDeliver: (s: string) => s === 'granted' || s === 'provisional',
  scheduleDailyCheckIns: jest.fn(() => Promise.resolve(0)),
  cancelDailyCheckIns: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/notifications/api', () => ({
  fetchPrefs: jest.fn(),
  updatePrefs: jest.fn(() => Promise.resolve()),
  registerDeviceToken: jest.fn(() => Promise.resolve()),
}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));

const reminders = jest.requireMock('@features/notifications/reminders') as {
  getNotificationPermission: jest.Mock;
  scheduleDailyCheckIns: jest.Mock;
  cancelDailyCheckIns: jest.Mock;
};
const api = jest.requireMock('@features/notifications/api') as { fetchPrefs: jest.Mock };

type Item = { key: string; at: Date; body: string };

function captureAppStateListener() {
  const ref: { current: ((s: string) => void) | null } = { current: null };
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_e: string, handler: (s: string) => void) => {
      ref.current = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof AppState.addEventListener);
  return ref;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function deviceToday(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  reminders.getNotificationPermission.mockResolvedValue('granted');
  await AsyncStorage.clear();
});

describe('useDailyPromptReminder', () => {
  it('reminder on: each of the next days gets its own check-in with that day’s prompt, at the chosen time', async () => {
    api.fetchPrefs.mockResolvedValue({ journaling_reminder: true, reminder_time: '21:00:00' });
    captureAppStateListener();

    await renderHook(() => useDailyPromptReminder(), { wrapper });
    await waitFor(() => expect(reminders.scheduleDailyCheckIns).toHaveBeenCalledTimes(1));

    const items = reminders.scheduleDailyCheckIns.mock.calls[0]![0] as Item[];
    expect(items).toHaveLength(PLAN_DAYS);
    expect(items[0]!.key).toBe(deviceToday());
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      expect(DAILY_PROMPTS).toContain(item.body); // just the prompt, nothing else in the body
      expect(item.at.getHours()).toBe(21);
      expect(item.at.getMinutes()).toBe(0);
      if (i > 0) {
        // One per consecutive calendar day, and the prompt moves every day.
        expect(item.at.getTime() - items[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(23 * 3600e3);
        expect(item.body).not.toBe(items[i - 1]!.body);
      }
    }

    // The home screen shows exactly today's scheduled prompt (one shared daily pick).
    expect(await todaysPrompt(deviceToday(), true)).toBe(items[0]!.body);
  });

  it('a denied permission keeps the chosen time: it schedules once permission is granted outside the app', async () => {
    api.fetchPrefs.mockResolvedValue({ journaling_reminder: true, reminder_time: '21:00:00' });
    reminders.getNotificationPermission.mockResolvedValue('denied');
    const appState = captureAppStateListener();

    await renderHook(() => useDailyPromptReminder(), { wrapper });
    await waitFor(() => expect(reminders.cancelDailyCheckIns).toHaveBeenCalled());
    expect(reminders.scheduleDailyCheckIns).not.toHaveBeenCalled();

    reminders.getNotificationPermission.mockResolvedValue('granted');
    appState.current?.('active');
    await waitFor(() => expect(reminders.scheduleDailyCheckIns).toHaveBeenCalledTimes(1));
    const items = reminders.scheduleDailyCheckIns.mock.calls[0]![0] as Item[];
    expect(items[0]!.at.getHours()).toBe(21);
  });

  it('reminder off: everything is cancelled and nothing is scheduled', async () => {
    api.fetchPrefs.mockResolvedValue({ journaling_reminder: false, reminder_time: '21:00:00' });
    captureAppStateListener();

    await renderHook(() => useDailyPromptReminder(), { wrapper });
    await waitFor(() => expect(reminders.cancelDailyCheckIns).toHaveBeenCalled());
    expect(reminders.scheduleDailyCheckIns).not.toHaveBeenCalled();
  });

  it('does nothing while prefs are still loading, so a cold start never cancels a live reminder', async () => {
    api.fetchPrefs.mockReturnValue(new Promise(() => {}));
    captureAppStateListener();

    await renderHook(() => useDailyPromptReminder(), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(reminders.cancelDailyCheckIns).not.toHaveBeenCalled();
    expect(reminders.scheduleDailyCheckIns).not.toHaveBeenCalled();
  });
});
