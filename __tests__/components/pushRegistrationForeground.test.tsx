/**
 * The push token (audit 2026-09-30): it used to be registered only at launch, so notifications
 * allowed later (in the app or in the phone's Settings) didn't reach the phone until a relaunch.
 * Now each return to the foreground tries again until it's registered, then stops.
 * One render per file (React 19 leaks across sibling renders).
 */
import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePushRegistration } from '@features/notifications/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));
const mockRegisterForPush = jest.fn();
jest.mock('@features/notifications/push', () => ({ registerForPush: () => mockRegisterForPush() }));
const mockSaveToken = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('@features/notifications/api', () => ({
  registerDeviceToken: (...a: unknown[]) => mockSaveToken(...a),
  fetchPrefs: jest.fn(),
  updatePrefs: jest.fn(),
}));

it('registers on the first foreground after notifications are allowed, then stops asking', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    onChange = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);

  mockRegisterForPush.mockResolvedValue(null); // not allowed yet
  await renderHook(() => usePushRegistration());
  await waitFor(() => expect(mockRegisterForPush).toHaveBeenCalledTimes(1));
  expect(mockSaveToken).not.toHaveBeenCalled();

  mockRegisterForPush.mockResolvedValue({ platform: 'ios', token: 'tok-1' });
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(mockSaveToken).toHaveBeenCalledWith('user-1', 'ios', 'tok-1'));

  await act(async () => {
    onChange('active');
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(mockRegisterForPush).toHaveBeenCalledTimes(2); // registered: no more attempts
  expect(mockSaveToken).toHaveBeenCalledTimes(1);
});
