/**
 * Client 10/14 p.3: "There should always be a name saved, it needs to pull a name 100 percent of
 * the time." useEnsureDisplayName (app root) fills an EMPTY profile name from the account: on app
 * start, after any sign-in, and again when the account's names change (Apple's one-time name lands
 * a moment after the sign-in). The email fallback only once onboarding is finished, so it can never
 * get in ahead of the name the sign-up step saves. Never for anonymous onboarding users, never over
 * a name that is already there, at most once per account + names.
 * One render per file (React 19 leaks across sibling renders).
 */
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEnsureDisplayName } from '@features/profile/hooks';

type MockUser = {
  id: string;
  is_anonymous?: boolean;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};
type MockProfile = { user_id: string; display_name: string | null; onboarding_completed: boolean };
let mockUser: MockUser | null = null;
const mockProfiles: Record<string, MockProfile> = {};
const mockSync = jest.fn(
  (_name: string | undefined, _opts: { allowEmailFallback?: boolean }) => Promise.resolve(null),
);

jest.mock('@store/session', () => ({ useCurrentUser: () => mockUser }));
jest.mock('@features/profile/api', () => ({
  ...jest.requireActual('@features/profile/api'),
  fetchMyProfile: (id: string) => Promise.resolve(mockProfiles[id] ?? null),
  syncDisplayNameFromAuth: (name: string | undefined, opts: { allowEmailFallback?: boolean }) =>
    mockSync(name, opts),
}));

it('fills only empty names, once per account + names, with the email fallback only after onboarding', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  // 1. Anonymous onboarding user without a name: nothing to do.
  mockUser = { id: 'anon', is_anonymous: true, email: null };
  mockProfiles.anon = { user_id: 'anon', display_name: null, onboarding_completed: false };
  const { rerender } = await renderHook(() => useEnsureDisplayName(), { wrapper });
  await waitFor(() => expect(qc.getQueryData(['profile', 'anon'])).toBeTruthy());
  expect(mockSync).not.toHaveBeenCalled();

  // 2. New Apple account from the Sign In screen, still in onboarding: filled WITHOUT the email
  //    fallback (Apple's one-time name, held for the sign-in, is what the sync picks up).
  mockUser = { id: 'u1', is_anonymous: false, email: 'x8k2qf9w@privaterelay.appleid.com', user_metadata: {} };
  mockProfiles.u1 = { user_id: 'u1', display_name: null, onboarding_completed: false };
  await act(async () => rerender({}));
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  expect(mockSync).toHaveBeenLastCalledWith(undefined, { allowEmailFallback: false });

  // Same account, same names: not again.
  await act(async () => rerender({}));
  expect(mockSync).toHaveBeenCalledTimes(1);

  // 3. Apple's name lands on the account a moment later: try again with it.
  mockUser = { ...mockUser, user_metadata: { display_name: 'Konah Quittman' } };
  await act(async () => rerender({}));
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));

  // 4. The profile now has the name: done, no more calls even when the account's names change.
  await act(async () => {
    qc.setQueryData(['profile', 'u1'], { ...mockProfiles.u1, display_name: 'Konah Quittman' });
  });
  mockUser = { ...mockUser, user_metadata: { display_name: 'Konah Quittman', full_name: 'Other' } };
  await act(async () => rerender({}));
  expect(mockSync).toHaveBeenCalledTimes(2);

  // 5. An account with a name the user chose (even one that matches their email): never touched.
  mockUser = { id: 'u2', is_anonymous: false, email: 'sam@x.com', user_metadata: { full_name: 'Samuel' } };
  mockProfiles.u2 = { user_id: 'u2', display_name: 'Sam', onboarding_completed: true };
  await act(async () => rerender({}));
  await waitFor(() => expect(qc.getQueryData(['profile', 'u2'])).toBeTruthy());
  expect(mockSync).toHaveBeenCalledTimes(2);

  // 6. A finished-onboarding account whose name is empty: filled, email fallback allowed.
  mockUser = { id: 'u3', is_anonymous: false, email: 'lee@x.com', user_metadata: {} };
  mockProfiles.u3 = { user_id: 'u3', display_name: null, onboarding_completed: true };
  await act(async () => rerender({}));
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(3));
  expect(mockSync).toHaveBeenLastCalledWith(undefined, { allowEmailFallback: true });
});
