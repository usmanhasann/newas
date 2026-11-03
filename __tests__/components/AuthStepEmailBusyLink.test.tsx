/**
 * Client 10/14 p.32 (spinner only on the tapped button, the rest can't be tapped): while Create
 * Account runs, "Use a different sign-in option" is grayed out and does nothing, so the person
 * stays with the Create Account spinner until it settles.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@features/auth', () => ({
  existingAccountKind: () => null,
  socialSignInMessage: () => 'x',
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  isUserCanceledSignIn: () => false,
  // Create Account stays in progress so the busy state can be inspected.
  linkEmailIdentity: jest.fn(() => new Promise<void>(() => {})),
  signInWithApple: jest.fn(() => Promise.resolve(null)),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const auth = jest.requireMock('@features/auth') as { linkEmailIdentity: jest.Mock };
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));
// The 6-digit code step that follows Create Account (never reached here: the link never settles).
jest.mock('@features/email-verification', () => ({ EmailCodeVerifier: () => null }));

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

it('while Create Account runs, the switch-back link is grayed out and ignored', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  fireEvent.press(utils.getByRole('button', { name: 'Continue with Email' }));
  fireEvent.changeText(
    await utils.findByPlaceholderText('What should we call you?'),
    'Sam',
  );
  fireEvent.changeText(utils.getByPlaceholderText('you@example.com'), 'sam@example.com');
  fireEvent.changeText(utils.getByPlaceholderText('Create a password'), 'password123');

  const link = () =>
    utils.getByRole('button', { name: 'Use a different sign-in option' });
  expect(link().props.accessibilityState).toMatchObject({ disabled: false });

  fireEvent.press(utils.getByRole('button', { name: 'Create Account' }));
  await waitFor(() => expect(auth.linkEmailIdentity).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(link().props.accessibilityState).toMatchObject({ disabled: true }),
  );
  expect(String(link().props.className)).toContain('opacity-50');
  // While loading, the shared Button shows its spinner in place of the "Create Account" title.
  expect(
    utils.getAllByRole('button').some((b) => b.props.accessibilityState?.busy === true),
  ).toBe(true);

  fireEvent.press(link());
  expect(utils.getByText('Create your account')).toBeTruthy(); // still on the email form
});
