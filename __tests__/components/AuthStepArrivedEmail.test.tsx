/**
 * An email + password account that arrives on the sign-up step already created (the app was closed
 * on the code step, or it signed in before finishing onboarding) still verifies before the paywall
 * (N5, client revisions 10/14 p.18): the code step shows straight away and nothing advances until
 * the code is confirmed. One render per file.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@store/session', () => ({
  useCurrentUser: () => ({
    id: 'u1',
    is_anonymous: false,
    identities: [{ provider: 'email' }],
  }),
}));
jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve(null)),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));
const mockVerifier: { onVerified?: () => void } = {};
jest.mock('@features/email-verification', () => ({
  EmailCodeVerifier: (p: { onVerified: () => void }) => {
    mockVerifier.onVerified = p.onVerified;
    return null;
  },
}));

const nav = {
  hydrated: true,
  data: {},
  step: 'auth',
  steps: [],
  progress: { index: 14, total: 15 },
  canBack: false,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(),
  goNext: jest.fn(() => Promise.resolve()),
  goBack: jest.fn(),
} as OnboardingNav;

it('shows the code step on arrival and only advances once the email is verified', async () => {
  const { getByText, queryByText } = await render(<AuthStep nav={nav} />);
  expect(getByText('Verify your email')).toBeTruthy();
  expect(queryByText('Continue with Email')).toBeNull(); // no way around it
  expect(nav.goNext).not.toHaveBeenCalled();

  await act(async () => mockVerifier.onVerified!());
  await waitFor(() => expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'email' }));
});
