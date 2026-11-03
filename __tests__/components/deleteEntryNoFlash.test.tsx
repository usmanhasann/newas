/**
 * Deleting an entry from Entry Detail (audit 2026-09-30): the delete used to drop the entry's cached
 * data while its page was still on screen, so the page refetched the (now deleted) entry and flashed
 * "This entry couldn't be found" during its exit. The entry's data now stays put, unrefetched, until
 * the page closes, and is dropped right after.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeleteEntry, useEntry, journalKeys } from '@features/journal/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'user-1' }) }));
const mockGetEntry = jest.fn((id: string) => Promise.resolve({ id, note: 'Matcha with Augie.' }));
jest.mock('@features/journal/api', () => ({
  getEntry: (id: string) => mockGetEntry(id),
  deleteEntry: jest.fn(() => Promise.resolve()),
}));

it('keeps the open entry steady through the delete, then forgets it once the page closes', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result, unmount } = await renderHook(
    () => ({ entry: useEntry('e1'), del: useDeleteEntry() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.entry.data?.id).toBe('e1'));
  expect(mockGetEntry).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.del.mutateAsync('e1');
  });
  // Still showing the entry (no refetch, no "couldn't be found") while the page is leaving.
  expect(result.current.entry.data?.id).toBe('e1');
  expect(result.current.entry.isLoading).toBe(false);
  expect(mockGetEntry).toHaveBeenCalledTimes(1);
  expect(qc.getQueryCache().find({ queryKey: journalKeys.entry('e1') })).toBeDefined();

  // The page closes: its data goes with it.
  await unmount();
  expect(qc.getQueryCache().find({ queryKey: journalKeys.entry('e1') })).toBeUndefined();
});
