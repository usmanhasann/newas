/**
 * Client 10/14 p.32 (bug + screenshot): tapping "Continue with Apple" showed the loading spinner on
 * the GOOGLE button. Now only the tapped button shows a spinner; the others are grayed out (can't be
 * tapped) but keep their normal text and icons. "Save your progress" (onboarding) screen.
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
  // Apple's sheet stays open (never resolves) so the in-progress state can be inspected.
  signInWithApple: jest.fn(() => new Promise<void>(() => {})),
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

it('tapping Apple: spinner only on Apple; Google and Email grayed out with their text and icons', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  const apple = await utils.findByRole('button', { name: 'Continue with Apple' });
  fireEvent.press(apple);

  await waitFor(() =>
    expect(
      utils.getByRole('button', { name: 'Continue with Apple' }).props.accessibilityState,
    ).toMatchObject({ busy: true }),
  );
  const google = utils.getByRole('button', { name: 'Continue with Google' });
  const email = utils.getByRole('button', { name: 'Continue with Email' });

  // Google: NOT loading, can't be tapped, still shows its title and its G logo.
  expect(google.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
  expect(utils.getByText('Continue with Google')).toBeTruthy();
  expect(
    utils.getByTestId('google-g-logo', { includeHiddenElements: true }),
  ).toBeTruthy();
  // Email: can't be tapped, title kept.
  expect(email.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
  expect(utils.getByText('Continue with Email')).toBeTruthy();

  // Exactly one spinner on the screen, inside the Apple button.
  const spinners =
    JSON.stringify(utils.toJSON()).match(/"type":"ActivityIndicator"/g) ?? [];
  expect(spinners).toHaveLength(1);
  // The tapped button itself is not grayed out; the others are.
  expect(
    String(utils.getByRole('button', { name: 'Continue with Apple' }).props.className),
  ).not.toContain('opacity-50');
  expect(String(google.props.className)).toContain('opacity-50');
  expect(String(email.props.className)).toContain('opacity-50');
});
