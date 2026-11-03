/**
 * An invite code typed at sign-up for a circle that has since been archived (client revisions 10/14
 * p.23: "no one new can join"): the person is told why it didn't work, not that their connection
 * failed, and nobody is notified. One render per file (React 19 leaks across sibling renders).
 */
import { render, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePendingInviteStore } from '@store/pendingInvite';
import { usePendingInviteRedeem } from '@features/circles/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u-new' }) }));
const mockToastError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { success: jest.fn(), error: (m: string) => mockToastError(m) },
}));
const mockNotify = jest.fn();
jest.mock('@features/notifications', () => ({ notifyEvent: (e: unknown) => mockNotify(e) }));
const mockJoin = jest.fn();
const mockNotifyCircle = jest.fn();
jest.mock('@features/circles/api', () => {
  class CircleArchivedError extends Error {
    constructor() {
      super('This circle has been archived, so no one new can join.');
    }
  }
  return {
    CircleArchivedError,
    joinByCode: (c: string) => mockJoin(c),
    notifyCircleEvent: (e: unknown) => mockNotifyCircle(e),
  };
});

function Harness() {
  usePendingInviteRedeem();
  return null;
}

it('says the circle is archived when its code can no longer be used', async () => {
  const { CircleArchivedError } = jest.requireMock('@features/circles/api') as {
    CircleArchivedError: new () => Error;
  };
  mockJoin.mockRejectedValueOnce(new CircleArchivedError());
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );

  await act(async () => {
    usePendingInviteStore.getState().set('OLDCODE');
  });
  await waitFor(() =>
    expect(mockToastError).toHaveBeenCalledWith(
      'This circle has been archived, so no one new can join.',
    ),
  );
  expect(mockToastError).not.toHaveBeenCalledWith(
    'We couldn’t use your invite code right now. You can join from the Circles tab.',
  );
  expect(mockNotify).not.toHaveBeenCalled();
  expect(mockNotifyCircle).not.toHaveBeenCalled();
});
