/**
 * The circle notices the mutation hooks send (client revisions 10/14):
 *  - archiving / unarchiving a circle tells everyone else in it (p.24): circle_archived /
 *    circle_unarchived, and Your Circles, the circle and Discover refresh;
 *  - joining a Public circle from Discover tells its owner (p.9): member_joined;
 *  - a sign-up invite code for an archived circle says why it didn't work.
 * circles/api is mocked so this checks what is sent, not the database.
 */
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useArchiveCircle, useJoinCircle, useUnarchiveCircle } from '@features/circles/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));

const mockArchive = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockUnarchive = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockJoin = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockNotifyCircle = jest.fn();
jest.mock('@features/circles/api', () => ({
  archiveCircle: (...a: unknown[]) => mockArchive(...a),
  unarchiveCircle: (...a: unknown[]) => mockUnarchive(...a),
  joinCircle: (...a: unknown[]) => mockJoin(...a),
  notifyCircleEvent: (...a: unknown[]) => mockNotifyCircle(...a),
}));

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockNotifyCircle.mockReset();
});

it('archiving: archives, refreshes the lists, and tells the circle', async () => {
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => useArchiveCircle(), { wrapper });
  await result.current.mutateAsync('c1');
  expect(mockArchive).toHaveBeenCalledWith('c1');
  await waitFor(() =>
    expect(mockNotifyCircle).toHaveBeenCalledWith({ type: 'circle_archived', circle_id: 'c1' }),
  );
  const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
  expect(keys).toEqual(
    expect.arrayContaining([
      JSON.stringify(['circles', 'detail', 'c1']),
      JSON.stringify(['circles', 'my', 'u1']),
      JSON.stringify(['circles', 'public']),
    ]),
  );
});

it('unarchiving: unarchives and tells the circle it is active again', async () => {
  const { result } = await renderHook(() => useUnarchiveCircle(), { wrapper });
  await result.current.mutateAsync('c2');
  expect(mockUnarchive).toHaveBeenCalledWith('c2');
  expect(mockArchive).not.toHaveBeenCalledWith('c2');
  await waitFor(() =>
    expect(mockNotifyCircle).toHaveBeenCalledWith({ type: 'circle_unarchived', circle_id: 'c2' }),
  );
});

it('joining a Public circle from Discover tells its owner', async () => {
  const { result } = await renderHook(() => useJoinCircle(), { wrapper });
  await result.current.mutateAsync('c3');
  expect(mockJoin).toHaveBeenCalledWith('c3', 'u1');
  await waitFor(() =>
    expect(mockNotifyCircle).toHaveBeenCalledWith({ type: 'member_joined', circle_id: 'c3' }),
  );
});

it('a join that fails tells nobody', async () => {
  mockJoin.mockRejectedValueOnce(new Error('circle_archived'));
  const { result } = await renderHook(() => useJoinCircle(), { wrapper });
  await expect(result.current.mutateAsync('c4')).rejects.toThrow();
  expect(mockNotifyCircle).not.toHaveBeenCalled();
});
