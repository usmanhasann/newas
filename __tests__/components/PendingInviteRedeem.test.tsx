/**
 * An invite code typed while creating an account (onboarding email sign-up, or the Sign Up screen)
 * is redeemed as soon as the account is signed in, with a clear result, never silently dropped
 * (audit 2026-09-30: upgrading the onboarding session never ran the server-side redeem). Private →
 * "Request sent…" and the owner is told; Public → joined; no match → said plainly.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePendingInviteStore } from '@store/pendingInvite';
import { usePendingInviteRedeem } from '@features/circles/hooks';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u-new' }) }));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { success: (m: string) => mockToastSuccess(m), error: (m: string) => mockToastError(m) },
}));
const mockNotify = jest.fn();
jest.mock('@features/notifications', () => ({ notifyEvent: (e: unknown) => mockNotify(e) }));
const mockJoin = jest.fn();
const mockNotifyCircle = jest.fn();
jest.mock('@features/circles/api', () => ({
  joinByCode: (c: string) => mockJoin(c),
  notifyCircleEvent: (e: unknown) => mockNotifyCircle(e),
}));

function Harness() {
  usePendingInviteRedeem();
  return null;
}
function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

it('redeems the code once signed in, says what happened, and tells a Private circle’s owner', async () => {
  mockJoin
    .mockResolvedValueOnce({ circleId: 'c1', status: 'requested', name: 'Family' })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ circleId: 'c2', status: 'approved', name: 'Runners' });
  await render(wrap(<Harness />));

  // Private circle: a request, the owner is told, the code is used up.
  await act(async () => {
    usePendingInviteStore.getState().set(' abc123 ');
  });
  await waitFor(() =>
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Request sent to join “Family.” You’ll get in once the owner approves.',
    ),
  );
  expect(mockJoin).toHaveBeenCalledWith('abc123');
  expect(mockNotify).toHaveBeenCalledWith({ type: 'join_request', circle_id: 'c1' });
  expect(usePendingInviteStore.getState().code).toBeNull();

  // A code that matches nothing is said plainly (never silent).
  await act(async () => {
    usePendingInviteStore.getState().set('NOPE');
  });
  await waitFor(() =>
    expect(mockToastError).toHaveBeenCalledWith(
      'That invite code didn’t match a circle. You can join one anytime from the Circles tab.',
    ),
  );

  // Public circle: joined straight away.
  await act(async () => {
    usePendingInviteStore.getState().set('RUN');
  });
  await waitFor(() => expect(mockToastSuccess).toHaveBeenLastCalledWith('You joined “Runners.”'));
  expect(mockJoin).toHaveBeenCalledTimes(3);
  // ...and its owner is told someone joined (client revisions 10/14 p.9).
  expect(mockNotifyCircle).toHaveBeenCalledWith({ type: 'member_joined', circle_id: 'c2' });
  expect(mockNotifyCircle).toHaveBeenCalledTimes(1);
});
