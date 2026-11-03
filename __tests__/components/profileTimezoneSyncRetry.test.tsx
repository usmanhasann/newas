/**
 * Client 10/14 p.30: the phone's zone is checked when the app opens, for every account (also after
 * onboarding, also when the phone is on UTC), and saved when it differs. A save that fails (no
 * signal on landing) is tried again the next time the app comes back, until it lands.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile, useSyncProfileTimezone } from '@features/profile/hooks';

jest.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'Asia/Karachi' }] }));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
const mockSave = jest.fn();
jest.mock('@features/profile/api', () => ({
  fetchMyProfile: () => Promise.resolve({ user_id: 'u2', timezone: 'UTC', onboarding_completed: true }),
  saveMyTimezone: (uid: string, zone: string) => mockSave(uid, zone),
}));

it('saves the phone’s zone on open and retries a failed save on the next return', async () => {
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
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockSave
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ user_id: 'u2', timezone: 'Asia/Karachi', onboarding_completed: true });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(
    () => {
      useSyncProfileTimezone();
      return useProfile().data?.timezone;
    },
    { wrapper },
  );

  // On open: an onboarded account still on UTC follows the phone right away.
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave).toHaveBeenLastCalledWith('u2', 'Asia/Karachi');
  await waitFor(() => expect(result.current).toBe('Asia/Karachi')); // the app uses it even though the save failed

  // The save failed: tried again on the next return to the app, and only until it lands.
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  await act(async () => {
    onChange('background');
  });
  await act(async () => {
    onChange('active');
  });
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(result.current).toBe('Asia/Karachi');
});
