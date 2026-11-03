/**
 * A new user can start on the Sign In screen ("Continue with Google/Apple") and is then sent through
 * onboarding already signed in. The sign-up step skips the (would-error) re-link for them, but must
 * still put the account's name on the profile (client 10/14 p.3: a name 100 percent of the time).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// AuthStep sends a person who already has an account to Sign In (a sibling screen).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({
    id: 'u1',
    is_anonymous: false,
    identities: [{ provider: 'google' }],
  }),
}));
jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve(null)),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const mockSyncName = jest.fn();
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: mockSyncName }),
}));
const auth = jest.requireMock('@features/auth') as { signInWithGoogle: jest.Mock };

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

it('an already signed-in arrival gets its name synced and advances, without re-linking', async () => {
  await render(<AuthStep nav={nav} />);
  await waitFor(() => expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'google' }));
  expect(mockSyncName).toHaveBeenCalledWith(undefined);
  expect(auth.signInWithGoogle).not.toHaveBeenCalled();
});
