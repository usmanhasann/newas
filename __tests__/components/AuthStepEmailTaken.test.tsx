/**
 * "Save your progress" with an email that already has a LYSM account (N4, client revisions 10/14
 * p.16): a Google / Apple only account opens linking (confirm with that provider, then set a
 * password); an account with a password is signed in to with it (the email sign-in page opens with
 * the email filled in); no answer keeps today's message. Never a second account.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';
import { useToastStore } from '@store/toast';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));
jest.mock('@features/email-verification', () => ({ EmailCodeVerifier: () => null }));
jest.mock('@features/auth', () => {
  const errors = jest.requireActual('@features/auth/errors');
  return {
    existingAccountKind: errors.existingAccountKind,
    socialSignInMessage: errors.socialSignInMessage,
    isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
    isUserCanceledSignIn: () => false,
    linkEmailIdentity: jest.fn(),
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    resolveAccountLink: jest.fn(),
    startEmailAccountLink: jest.fn(),
  };
});
const auth = jest.requireMock('@features/auth') as Record<string, jest.Mock>;

const nav = {
  hydrated: true,
  data: {},
  step: 'auth',
  steps: [],
  progress: null,
  canBack: false,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(),
  goNext: jest.fn(() => Promise.resolve()),
  goBack: jest.fn(),
} as OnboardingNav;

const taken = {
  code: 'email_exists',
  message: 'A user with this email address has already been registered',
};

it('routes a taken email to the right way in', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Email' }));
  await fireEvent.changeText(
    await utils.findByPlaceholderText('What should we call you?'),
    'Sam',
  );
  await fireEvent.changeText(
    utils.getByPlaceholderText('you@example.com'),
    ' sam@example.com ',
  );
  await fireEvent.changeText(
    utils.getByPlaceholderText('Create a password'),
    'password123',
  );
  const create = () =>
    fireEvent.press(utils.getByRole('button', { name: 'Create Account' }));

  // An account with a password (or not answered as Google / Apple only): sign in with it.
  auth.linkEmailIdentity.mockRejectedValueOnce(taken);
  auth.startEmailAccountLink.mockResolvedValueOnce('none');
  await create();
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith('EmailSignIn', {
      email: 'sam@example.com',
    }),
  );
  expect(useToastStore.getState().message).toBe(
    'An account with this email already exists. Sign in with your email and password.',
  );
  expect(auth.startEmailAccountLink).toHaveBeenCalledWith(
    'sam@example.com',
    'onboarding',
    expect.any(Function),
  );

  // A Google / Apple only account: linking opens.
  auth.linkEmailIdentity.mockRejectedValueOnce(taken);
  auth.startEmailAccountLink.mockImplementationOnce(
    async (_e: string, _o: string, open: () => void) => {
      open();
      return 'opened';
    },
  );
  await create();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('LinkAccount'));

  // No answer: today's message, nothing opened.
  auth.linkEmailIdentity.mockRejectedValueOnce(taken);
  auth.startEmailAccountLink.mockResolvedValueOnce('unknown');
  await create();
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'We couldn’t create your account. That email may already be in use.',
    ),
  );
  expect(mockNavigate).toHaveBeenCalledTimes(2);
  expect(nav.goNext).not.toHaveBeenCalled();
});
