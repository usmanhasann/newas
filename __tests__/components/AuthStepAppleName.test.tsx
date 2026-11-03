/**
 * Client 10/14 p.10: Apple shares the user's name only on the first authorization, so the name
 * must reach the profile at that moment. The sign-up step passes Apple's name straight to the
 * profile name sync (not just "whatever the account has later").
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
  signInWithApple: jest.fn(() => Promise.resolve('Konah Quittman')),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const mockSyncName = jest.fn();
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: mockSyncName }),
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
  // Non-resolving so the handler suspends at `await goNext` (no out-of-act update after the test).
  goNext: jest.fn(() => new Promise<void>(() => {})),
  goBack: jest.fn(),
} as OnboardingNav;

it('Continue with Apple passes Apple’s one-time name to the profile, then continues', async () => {
  const utils = await render(<AuthStep nav={nav} />);
  fireEvent.press(await utils.findByRole('button', { name: 'Continue with Apple' }));
  await waitFor(() => expect(mockSyncName).toHaveBeenCalledWith('Konah Quittman'));
  await waitFor(() => expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'apple' }));
});
