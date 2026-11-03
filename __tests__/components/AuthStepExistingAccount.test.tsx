/**
 * Client 10/14 p.15: never block silently. On "Save your progress" there is no back button, so a
 * person whose Google account or email already has a LYSM account is told so AND taken to Sign In
 * (where the message is something they can act on). Any other failure: the message only.
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
jest.mock('@features/auth', () => {
  const errors = jest.requireActual('@features/auth/errors');
  return {
    existingAccountKind: errors.existingAccountKind,
    socialSignInMessage: errors.socialSignInMessage,
    isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
    isUserCanceledSignIn: () => false,
    linkEmailIdentity: jest.fn(() => Promise.resolve()),
    signInWithApple: jest.fn(() => Promise.resolve(null)),
    signInWithGoogle: jest.fn(() => Promise.resolve()),
    // Not an account-link stop (N4): the usual message.
    resolveAccountLink: jest.fn(() => Promise.resolve(null)),
  };
});
const auth = jest.requireMock('@features/auth') as { signInWithGoogle: jest.Mock };
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));

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
  goNext: jest.fn(() => new Promise<void>(() => {})),
  goBack: jest.fn(),
} as OnboardingNav;

it('existing account → message + Sign In; any other failure → message only', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  const google = () => utils.getByRole('button', { name: 'Continue with Google' });

  auth.signInWithGoogle.mockRejectedValueOnce({
    code: 'no_session',
    message: 'Google sign-in did not complete',
  });
  fireEvent.press(google());
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'Google sign-in didn’t complete. Please try again.',
    ),
  );
  expect(mockNavigate).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(google().props.accessibilityState).toMatchObject({ busy: false }),
  );

  auth.signInWithGoogle.mockRejectedValueOnce({
    code: 'email_exists',
    message: 'A user with this email address has already been registered',
  });
  fireEvent.press(google());
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('SignIn'));
  expect(useToastStore.getState().message).toBe(
    'An account with this email already exists. Sign in with the method you used to create it.',
  );
  expect(nav.goNext).not.toHaveBeenCalled();
});
