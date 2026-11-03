import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// AuthStep sends a person who already has an account to Sign In (a sibling screen).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

// Mock the auth boundary so the test exercises the AuthStep flow without native modules.
jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve()),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const auth = jest.requireMock('@features/auth') as { linkEmailIdentity: jest.Mock };
// The auth step backfills the profile display name so Home greets by first name.
jest.mock('@features/profile', () => {
  const mutate = jest.fn();
  return { useSyncDisplayName: () => ({ mutate }) };
});
const profile = jest.requireMock('@features/profile') as {
  useSyncDisplayName: () => { mutate: jest.Mock };
};
// Client revisions 10/14 p.18 (N5): right after Create Account the 6-digit code step shows, and
// the paywall only comes once the email is verified. The code step itself is tested on its own
// (EmailCodeVerifier*.test.tsx); here it is a stand-in that hands its onVerified to the test.
const mockVerifier: { onVerified?: () => void } = {};
jest.mock('@features/email-verification', () => ({
  EmailCodeVerifier: (p: { onVerified: () => void }) => {
    mockVerifier.onVerified = p.onVerified;
    return null;
  },
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
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

// One async render per file (React 19 concurrent renders leak across sibling tests); the
// social path lives in AuthStepSocial.test.tsx.
describe('<AuthStep /> — email flow (§3/§5/§16, 10/14 p.18)', () => {
  it('validates the form, links the email identity, then blocks on the code until verified', async () => {
    const nav = makeNav();
    const { getByText, findByText, getByPlaceholderText } = await render(
      <AuthStep nav={nav} />,
    );

    fireEvent.press(await findByText('Continue with Email'));
    await findByText('Create Account'); // email form (matches the standalone Sign-Up page)

    // Empty form → validation blocks submit, nothing links. Wait for its message, so this submit
    // has finished before the next one.
    await act(async () => fireEvent.press(getByText('Create Account')));
    await findByText('Your name helps personalize LYSM');
    expect(auth.linkEmailIdentity).not.toHaveBeenCalled();

    // Each change is awaited inside act: React 19 renders it asynchronously.
    await act(async () =>
      fireEvent.changeText(getByPlaceholderText('What should we call you?'), 'Sam'),
    );
    await act(async () =>
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'sam@example.com'),
    );
    await act(async () =>
      fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123'),
    );

    // ONE press, then wait for the link. (Pressing again inside waitFor was flaky: on a busy
    // machine the first press had already moved on to "Verify your email", so the button was gone.)
    await act(async () => fireEvent.press(getByText('Create Account')));
    await waitFor(() => expect(auth.linkEmailIdentity).toHaveBeenCalled());

    expect(auth.linkEmailIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sam@example.com',
        password: 'password123',
        displayName: 'Sam',
      }),
    );
    // The typed name is synced into the profile so Home greets "Hello, Sam".
    await waitFor(() =>
      expect(profile.useSyncDisplayName().mutate).toHaveBeenCalledWith('Sam'),
    );

    // Blocked: the code step shows (same progress bar), and the paywall waits for it.
    await findByText('Verify your email');
    expect(mockVerifier.onVerified).toBeDefined();
    expect(nav.goNext).not.toHaveBeenCalled();

    // The code is confirmed: on to the paywall (auth_method 'email').
    await act(async () => mockVerifier.onVerified!());
    await waitFor(() =>
      expect(nav.goNext).toHaveBeenCalledWith({ auth_method: 'email' }),
    );
  });
});
