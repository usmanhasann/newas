/**
 * "Save your progress" (N4, client revisions 10/14 p.15-16): a Google / Apple sign-in that may
 * belong to an existing account goes to account linking. "Already have a LYSM account?" → "No,
 * create one" signs up here and moves on like a normal sign-up (with Apple's name); opening "Link
 * your account" leaves this step (the person continues in their existing account after linking).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
const mockSync = jest.fn();
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: mockSync }),
}));
jest.mock('@features/auth', () => {
  const errors = jest.requireActual('@features/auth/errors');
  return {
    existingAccountKind: errors.existingAccountKind,
    socialSignInMessage: errors.socialSignInMessage,
    isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
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

it('"No, create one" signs up and moves on; "Link your account" leaves the step', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  const stopped = new Error(
    'This sign-in needs to be linked to an existing account first',
  );

  auth.signInWithApple.mockRejectedValueOnce(stopped);
  auth.resolveAccountLink.mockResolvedValueOnce({
    kind: 'created',
    appleName: 'Konah Quittman',
  });
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Apple' }),
  );
  await waitFor(() => expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'apple' }));
  expect(mockSync).toHaveBeenCalledWith('Konah Quittman');
  expect(auth.resolveAccountLink).toHaveBeenCalledWith(stopped, expect.any(Function));

  auth.signInWithGoogle.mockRejectedValueOnce(stopped);
  auth.resolveAccountLink.mockImplementationOnce(
    async (_e: unknown, open: () => void) => {
      open();
      return { kind: 'opened' };
    },
  );
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('LinkAccount'));
  expect(nav.goNext).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalledWith('SignIn');

  // Cancelled at "Already have a LYSM account?": nothing happens.
  auth.signInWithGoogle.mockRejectedValueOnce(stopped);
  auth.resolveAccountLink.mockResolvedValueOnce({ kind: 'cancelled' });
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(auth.resolveAccountLink).toHaveBeenCalledTimes(3));
  expect(nav.goNext).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});
