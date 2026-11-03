/**
 * "Link your account" for an Apple only account signing in with Google (N4, client revisions 10/14
 * p.16): re-authenticate through APPLE, the provider the account was created with; it's the only
 * option. A cancelled sheet says nothing; a refusal is shown.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LinkAccountScreen } from '@features/auth/screens/LinkAccountScreen';
import { LinkFlowError } from '@features/auth/linkFlow';
import { useAccountLinkStore, type PendingLink } from '@features/auth/linking';
import { useToastStore } from '@store/toast';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  isUserCanceledSignIn: (e: { message?: string }) => /cancel/i.test(e?.message ?? ''),
}));
jest.mock('@features/auth/linkFlow', () => {
  class MockLinkFlowError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return {
    LinkFlowError: MockLinkFlowError,
    linkWithPassword: jest.fn(),
    linkWithProvider: jest.fn(),
    confirmForNewPassword: jest.fn(),
    finishNewPassword: jest.fn(),
  };
});
const flow = jest.requireMock('@features/auth/linkFlow') as Record<string, jest.Mock>;

const link: PendingLink = {
  kind: 'link',
  origin: 'signin',
  attempt: { provider: 'google', idToken: 'g-token', email: 'abe@example.com' },
  email: 'abe@example.com',
  method: 'apple',
};

it('offers only Apple, links Google after it, and explains refusals', async () => {
  useAccountLinkStore.getState().set(link);
  const utils = await render(<LinkAccountScreen />);

  const apple = await utils.findByRole('button', { name: 'Continue with Apple' });
  expect(utils.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  expect(utils.queryByRole('button', { name: 'Continue with Email' })).toBeNull();
  expect(utils.queryByPlaceholderText('Your password')).toBeNull();
  expect(
    utils.getByText(
      'There’s already a LYSM account for abe@example.com that signs in with Apple. Continue with Apple to confirm it’s you, and we’ll add Google to it.',
    ),
  ).toBeTruthy();

  flow.linkWithProvider.mockRejectedValueOnce(new LinkFlowError('reauth_mismatch'));
  await fireEvent.press(apple);
  const refusal =
    'That isn’t the account linked to LYSM. Try again with the account you use for LYSM.';
  expect(await utils.findByText(refusal)).toBeTruthy();
  expect(flow.linkWithProvider).toHaveBeenLastCalledWith(link, 'apple');

  flow.linkWithProvider.mockRejectedValueOnce(new Error('The user canceled the sign-in'));
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Apple' }));
  await waitFor(() => expect(flow.linkWithProvider).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(utils.queryByText(refusal)).toBeNull());

  flow.linkWithProvider.mockResolvedValueOnce('signed_in');
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Apple' }));
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'You’re signed in, but we couldn’t add Google this time. Try Google again next time you sign in.',
    ),
  );
});
