/**
 * Your Circles updates in real time on the Circles tab (client revisions 10/14 p.2 + p.24):
 *  - a post or reply in a circle moves it to the top without a refresh;
 *  - archiving moves it to the bottom at once, unarchiving back up among the active ones;
 *  - being let into a circle, reconnecting, or coming back to the app reloads the list;
 *  - leaving the tab stops listening.
 * api is mocked: this checks the hook's wiring and the order it keeps. One render per file.
 */
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyCircles } from '@features/circles/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));

type Handlers = {
  onCircleChange: (c: Record<string, unknown>) => void;
  onMembershipChange: () => void;
  onResubscribed: () => void;
};
const mockFetch = jest.fn();
const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn((..._a: unknown[]) => mockUnsubscribe);
jest.mock('@features/circles/api', () => ({
  fetchMyCircles: (...a: unknown[]) => mockFetch(...a),
  subscribeToMyCircles: (...a: unknown[]) => mockSubscribe(...a),
}));

const circle = (id: string, activity: string, archived: string | null = null) => ({
  id,
  name: id,
  type: 'private',
  role: 'member',
  archived_at: archived,
  joined_at: '2026-10-01T00:00:00.000Z',
  activity_at: activity,
});
const SERVER_LIST = [
  circle('a', '2026-10-12T00:00:00.000Z'),
  circle('b', '2026-10-11T00:00:00.000Z'),
  circle('c', '2026-10-10T00:00:00.000Z'),
  circle('z', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
];

it('keeps Your Circles in activity order live, and reloads when it may have missed something', async () => {
  // Every app-state listener registered while rendering (the hook's among them).
  const appStateHandlers: ((s: AppStateStatus) => void)[] = [];
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (s: AppStateStatus) => void);
    return { remove } as never;
  });
  const appState = (s: AppStateStatus) => appStateHandlers.forEach((h) => h(s));
  mockFetch.mockResolvedValue(SERVER_LIST);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  const { result, unmount } = await renderHook(() => useMyCircles({ live: true }), { wrapper });
  await waitFor(() => expect(result.current.data).toHaveLength(4));
  const ids = () => (result.current.data ?? []).map((c) => c.id);
  expect(ids()).toEqual(['a', 'b', 'c', 'z']);

  // Listening to exactly the user's circles.
  await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
  const [uid, listened, handlers] = mockSubscribe.mock.calls.at(-1) as [string, string[], Handlers];
  expect(uid).toBe('u1');
  expect([...listened].sort()).toEqual(['a', 'b', 'c', 'z']);

  // Someone posts in "c" while the tab is open: it moves to the top, no refresh.
  await act(async () => {
    handlers.onCircleChange({ id: 'c', last_activity_at: '2026-10-20T09:00:00+00:00' });
  });
  await waitFor(() => expect(ids()).toEqual(['c', 'a', 'b', 'z']));
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // The owner archives "a": straight to the bottom (above the older archived one by activity).
  await act(async () => {
    handlers.onCircleChange({ id: 'a', archived_at: '2026-10-20T10:00:00+00:00' });
  });
  await waitFor(() => expect(ids()).toEqual(['c', 'b', 'a', 'z']));

  // ...and unarchives it: back up among the active circles, by its activity.
  await act(async () => {
    handlers.onCircleChange({ id: 'a', archived_at: null });
  });
  await waitFor(() => expect(ids()).toEqual(['c', 'a', 'b', 'z']));

  // Let into a new circle (or reconnected): the list reloads from the server.
  await act(async () => {
    handlers.onMembershipChange();
  });
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  await act(async () => {
    handlers.onResubscribed();
  });
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

  // Back from the background: reload too (changes may have been missed meanwhile).
  await act(async () => {
    appState('background');
  });
  expect(mockFetch).toHaveBeenCalledTimes(3);
  await act(async () => {
    appState('active');
  });
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));

  // Leaving stops listening.
  await act(async () => {
    unmount();
  });
  expect(mockUnsubscribe).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
});
