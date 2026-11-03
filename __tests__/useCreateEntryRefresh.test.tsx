/**
 * Client 10/14 p.4 (O19.09): after the first entry, Insights leaves "Moods & Reflections / Start
 * journaling…" for its normal layout. That relies on saving an entry refreshing the reflections and
 * insights data (and the profile's first entry date); this locks that refresh.
 */
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateEntry } from '@features/journal/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/journal/api', () => ({
  createEntry: jest.fn(() => Promise.resolve({ id: 'e1' })),
}));

it('saving an entry refreshes reflections, insights and the profile', async () => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useCreateEntry(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ mood_slugs: ['calm'], note: 'First one' });
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reflections'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['insights'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile'] });
});
