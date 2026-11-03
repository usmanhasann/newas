/**
 * "Link your account" for an email + password account (N4, client revisions 10/14 p.15-16): its
 * password is the ONLY proof offered, the new sign-in is added only after it, and Cancel changes
 * nothing. One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LinkAccountScreen } from '@features/auth/screens/LinkAccountScreen';
import { LinkFlowError } from '@features/auth/linkFlow';
import { useAccountLinkStore, type PendingLink } from '@features/auth/linking';
import { useToastStore } from '@store/toast';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
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
  kind: 'link',
  origin: 'onboarding',
  attempt: { provider: 'google', idToken: 'g-token', email: 'sam@example.com' },
  email: 'sam@example.com',
  method: 'password',
};

it('asks only for the account’s password, then adds Google; Forgot password and Cancel', async () => {
  useAccountLinkStore.getState().set(link);
  const utils = await render(<LinkAccountScreen />);

  expect(utils.getByText('Link your account')).toBeTruthy();
  expect(
    utils.getByText(
      'There’s already a LYSM account for sam@example.com. Enter its password to confirm it’s you, and we’ll add Google to it.',
    ),
  ).toBeTruthy();
  // The password is the one proof for an account that has one (p.15): no provider buttons.
  expect(utils.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  expect(utils.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();

  await fireEvent.press(utils.getByText('Continue'));
  expect(utils.getByText('Enter your password.')).toBeTruthy();
  expect(flow.linkWithPassword).not.toHaveBeenCalled();

  flow.linkWithPassword.mockRejectedValueOnce(new LinkFlowError('wrong_password'));
  await fireEvent.changeText(utils.getByPlaceholderText('Your password'), 'nope');
  await fireEvent.press(utils.getByText('Continue'));
  expect(
    await utils.findByText('That password isn’t right. Please try again.'),
  ).toBeTruthy();

  await fireEvent.press(utils.getByText('Forgot password?'));
  expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword', {
    email: 'sam@example.com',
  });

  flow.linkWithPassword.mockResolvedValueOnce('linked');
  await fireEvent.changeText(utils.getByPlaceholderText('Your password'), 'Original 123');
  await fireEvent.press(utils.getByText('Continue'));
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'You’re in. Google now opens this account too.',
    ),
  );
  expect(flow.linkWithPassword).toHaveBeenLastCalledWith(
    link,
    'sam@example.com',
    'Original 123',
  );

  await fireEvent.press(utils.getByText('Cancel'));
  expect(mockGoBack).toHaveBeenCalled();
  expect(useAccountLinkStore.getState().pending).toBeNull();
});
