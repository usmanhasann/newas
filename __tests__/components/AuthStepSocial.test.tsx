import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// AuthStep sends a person who already has an account to Sign In (a sibling screen).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve()),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const auth = jest.requireMock('@features/auth') as { signInWithGoogle: jest.Mock };
// The auth step backfills the profile display name (Home greeting) — stub it out here.
jest.mock('@features/profile', () => ({
  useSyncDisplayName: () => ({ mutate: jest.fn() }),
}));

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
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
    // Non-resolving so the handler suspends at `await goNext` and its trailing setBusy(false)
    // never fires after the test — avoids a React 19 out-of-act update (locked isolation
    // pattern). The call is still recorded synchronously, so the assertion below holds.
    goNext: jest.fn(() => new Promise<void>(() => {})),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

// Social sign-in is provider-verified and must skip email verification (§16/§19): the
// step advances with auth_method 'google', which the flow uses to drop the verify step.
describe('<AuthStep /> — social sign-in (§3/§16/§19)', () => {
  it('Google links the identity and advances with auth_method google', async () => {
    const nav = makeNav();
    const { findByRole } = await render(<AuthStep nav={nav} />);

    // Google is a full-width "Continue with Google" button.
    fireEvent.press(await findByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'google' }),
    );
  });
});
