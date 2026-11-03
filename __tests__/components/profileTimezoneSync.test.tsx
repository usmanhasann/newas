/**
 * Client 10/14 p.30: no manual time zone any more; the app follows the phone. It is checked every
 * time the app comes back from the background and updated when it changed: a user on West Coast
 * time who flies to the East Coast switches to Eastern time once the phone does. "Today" (and so
 * the streak, Today's Moods, the Mood Breakdown and reflections) moves at once, before the save to
 * the server (which drives the 8 PM reminder and 9 AM recaps) has finished.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile, useSyncProfileTimezone } from '@features/profile/hooks';
import { useLocalToday } from '@hooks/useLocalToday';

const mockPhone = { zone: 'America/Los_Angeles' };
jest.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: mockPhone.zone }] }));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
const mockSave = jest.fn();
jest.mock('@features/profile/api', () => ({
  fetchMyProfile: () =>
    Promise.resolve({ user_id: 'u1', timezone: 'America/Los_Angeles', onboarding_completed: true }),
  saveMyTimezone: (uid: string, zone: string) => mockSave(uid, zone),
}));

it('switches to the phone’s new zone when the app comes back, and saves it once', async () => {
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
    // 9:30 PM Oct 20 in Los Angeles is already 12:30 AM Oct 21 in New York.
    now: new Date('2026-10-21T04:30:00Z'),
  });
  let finishSave: (row: unknown) => void = () => {};
  mockSave.mockImplementation(
    (_uid: string, zone: string) =>
      new Promise((resolve) => {
        finishSave = () => resolve({ user_id: 'u1', timezone: zone, onboarding_completed: true });
      }),
  );
  try {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(
      () => {
        useSyncProfileTimezone();
        const zone = useProfile().data?.timezone;
        return { zone, today: useLocalToday(zone) };
      },
      { wrapper },
    );

    // Opened on the West Coast: nothing to change.
    await waitFor(() => expect(result.current.zone).toBe('America/Los_Angeles'));
    expect(result.current.today).toBe('2026-10-20');
    expect(mockSave).not.toHaveBeenCalled();

    // Landed in New York; the phone switched zones while the app was in the background.
    mockPhone.zone = 'America/New_York';
    await act(async () => {
      onChange('active');
    });
    await waitFor(() => expect(result.current.zone).toBe('America/New_York'));
    expect(result.current.today).toBe('2026-10-21'); // before the save has finished
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('u1', 'America/New_York');

    await act(async () => {
      finishSave(null);
    });
    // Coming back again in the same zone saves nothing more.
    await act(async () => {
      onChange('active');
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.current.zone).toBe('America/New_York');
  } finally {
    jest.useRealTimers();
  }
});
