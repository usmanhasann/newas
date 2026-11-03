/**
 * Only the Circles tab listens live (useMyCircles({ live: true })). Everywhere else that reads the
 * user's circles (Profile, the widget settings, sharing an entry, Discover's "Joined") just reads the
 * list: no Realtime channel, and no reload on coming back to the app. One render per file.
 */
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyCircles } from '@features/circles/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));

const mockFetch = jest.fn();
const mockSubscribe = jest.fn();
jest.mock('@features/circles/api', () => ({
  fetchMyCircles: (...a: unknown[]) => mockFetch(...a),
  subscribeToMyCircles: (...a: unknown[]) => mockSubscribe(...a),
}));

it('reads the list without opening a live channel', async () => {
  const appStateHandlers: ((s: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (s: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
  mockFetch.mockResolvedValue([
    {
      id: 'a',
      name: 'a',
      type: 'private',
      role: 'member',
      archived_at: null,
      joined_at: null,
      activity_at: '2026-10-12T00:00:00.000Z',
    },
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  const { result } = await renderHook(() => useMyCircles(), { wrapper });
  await waitFor(() => expect(result.current.data).toHaveLength(1));

  expect(mockSubscribe).not.toHaveBeenCalled();
  // Coming back to the app doesn't reload it here (only the live Circles tab does).
  await act(async () => {
    appStateHandlers.forEach((h) => h('active'));
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
