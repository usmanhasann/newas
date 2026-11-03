/**
 * Client 10/14 p.32: the loading spinner only on the button the user tapped. Tapping "Continue
 * with Google" on "Save your progress": Google spins; Apple and Email are grayed out with their
 * normal text and icons.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// AuthStep sends a person who already has an account to Sign In (a sibling screen).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => new Promise<void>(() => {})),
  // Google's browser stays open (never resolves) so the in-progress state can be inspected.
  signInWithGoogle: jest.fn(() => new Promise<void>(() => {})),
  socialSignInMessage: () => 'x',
}));
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));

const nav = {
  hydrated: true,
  data: {},
  step: 'auth',
  steps: [],
  progress: null,
  canBack: true,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(),
  goNext: jest.fn(() => new Promise<void>(() => {})),
  goBack: jest.fn(),
} as OnboardingNav;

it('tapping Google: spinner only on Google; Apple and Email grayed out with their text and icons', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  await utils.findByRole('button', { name: 'Continue with Apple' });
  fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));

  await waitFor(() =>
    expect(
      utils.getByRole('button', { name: 'Continue with Google' }).props
        .accessibilityState,
    ).toMatchObject({ busy: true }),
  );
  const apple = utils.getByRole('button', { name: 'Continue with Apple' });
  const email = utils.getByRole('button', { name: 'Continue with Email' });
  expect(apple.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
  expect(email.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
  expect(utils.getByText('Continue with Apple')).toBeTruthy();
  expect(utils.getByText('Continue with Email')).toBeTruthy();
  expect(
    JSON.stringify(utils.toJSON()).match(/"type":"ActivityIndicator"/g) ?? [],
  ).toHaveLength(1);
  // While Google runs, nothing else can start (no second sign-in on top of it).
  fireEvent.press(apple);
  const auth = jest.requireMock('@features/auth') as { signInWithApple: jest.Mock };
  expect(auth.signInWithApple).not.toHaveBeenCalled();
});
