/**
 * A Google only account signing in with email + password (N4, client revisions 10/14 p.16):
 * re-authenticate through Google, THEN set a new password. The password fields appear only after
 * the re-authentication succeeded, never before (p.16). A stale confirmation goes back to step 1.
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
  isUserCanceledSignIn: () => false,
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
  kind: 'set_password',
  origin: 'signin',
  email: 'gina@example.com',
  provider: 'google',
};

it('confirms with Google first; only then the new password, which is set and signed in with', async () => {
  useAccountLinkStore.getState().set(link);
  const utils = await render(<LinkAccountScreen />);

  expect(utils.getByText('Confirm it’s you')).toBeTruthy();
  expect(utils.queryByPlaceholderText('New password')).toBeNull(); // not before the re-authentication
  expect(utils.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();

  flow.confirmForNewPassword.mockResolvedValueOnce('ticket-1');
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Google' }),
  );
  expect(await utils.findByText('Create a password')).toBeTruthy();
  expect(flow.confirmForNewPassword).toHaveBeenCalledWith(link);
  expect(flow.finishNewPassword).not.toHaveBeenCalled();

  await fireEvent.changeText(utils.getByPlaceholderText('New password'), 'Brand new 1');
  await fireEvent.changeText(
    utils.getByPlaceholderText('Re-enter new password'),
    'Brand new 2',
  );
  await fireEvent.press(utils.getByText('Set Password'));
  expect(utils.getByText('Passwords do not match')).toBeTruthy();
  expect(flow.finishNewPassword).not.toHaveBeenCalled();

  // A confirmation that went stale: back to confirming with Google.
  flow.finishNewPassword.mockRejectedValueOnce(new LinkFlowError('invalid_ticket'));
  await fireEvent.changeText(
    utils.getByPlaceholderText('Re-enter new password'),
    'Brand new 1',
  );
  await fireEvent.press(utils.getByText('Set Password'));
  expect(
    await utils.findByText('That took too long. Please confirm it’s you again.'),
  ).toBeTruthy();
  expect(utils.getByText('Confirm it’s you')).toBeTruthy();

  flow.confirmForNewPassword.mockResolvedValueOnce('ticket-2');
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Google' }),
  );
  await utils.findByText('Create a password');
  flow.finishNewPassword.mockResolvedValueOnce('signed_in');
  await fireEvent.press(utils.getByText('Set Password'));
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'Your password is set. You can now sign in with your email and password too.',
    ),
  );
  expect(flow.finishNewPassword).toHaveBeenLastCalledWith(
    'gina@example.com',
    'ticket-2',
    'Brand new 1',
  );
});
