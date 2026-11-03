/**
 * useVerifiedCircleOwners (Discover, client revisions 10/14 p.5, N7.18 / N7.19): asks once for the
 * circles shown (each id once) and is never kept as a stale copy (staleTime 0), so a badge an admin
 * turns off is gone the next time the list shows.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVerifiedCircleOwners } from '@features/circles/ownersHooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
const mockFetch = jest.fn((_ids: string[]) =>
  Promise.resolve(new Map([['c1', { ownerId: 'u9', name: 'Taylor Star' }]])),
);
jest.mock('@features/circles/ownersApi', () => ({
  fetchVerifiedCircleOwners: (ids: string[]) => mockFetch(ids),
}));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('fetches the shown circles once each, fresh every time', async () => {
  const { result } = await renderHook(() => useVerifiedCircleOwners(['c2', 'c1', 'c2']), {
    wrapper,
  });
  await waitFor(() => expect(result.current.get('c1')).toEqual({ ownerId: 'u9', name: 'Taylor Star' }));
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith(['c1', 'c2']);
  const query = qc.getQueryCache().findAll({ queryKey: ['circles', 'verified-owners'] })[0];
  expect(query?.isStale()).toBe(true); // re-read whenever a screen showing it opens
});
