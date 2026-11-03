/**
 * Client revisions 10/14 p.5 (N7.20 to N7.22): a name can't include check marks or verification
 * symbols when creating an account. On the onboarding email form ("Save your progress" → Continue
 * with Email), a name with one shows the client's exact message and no account is created; taking it
 * out clears the message and the account is created as before.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthStep } from '@features/onboarding/screens/steps/AuthStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@features/auth', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  linkEmailIdentity: jest.fn(() => Promise.resolve()),
  signInWithApple: jest.fn(() => Promise.resolve()),
  signInWithGoogle: jest.fn(() => Promise.resolve()),
}));
const auth = jest.requireMock('@features/auth') as { linkEmailIdentity: jest.Mock };
jest.mock('@features/profile', () => {
  const mutate = jest.fn();
  return { useSyncDisplayName: () => ({ mutate }) };
});
jest.mock('@features/email-verification', () => ({ EmailCodeVerifier: () => null }));

const MESSAGE = 'Names can’t include check marks or verification symbols.';

function makeNav(): OnboardingNav {
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
  } as OnboardingNav;
}

it('refuses a name with a check mark, with the client’s message, until it is taken out', async () => {
  const utils = await render(<AuthStep nav={makeNav()} />);
  fireEvent.press(await utils.findByText('Continue with Email'));
  await utils.findByText('Create Account');

  // Each change is awaited inside act: React 19 renders it asynchronously, and an un-awaited
  // change can be lost before the next one.
  const nameInput = () => utils.getByPlaceholderText('What should we call you?');
  await act(async () => fireEvent.changeText(nameInput(), 'Taylor ✅'));
  await act(async () =>
    fireEvent.changeText(
      utils.getByPlaceholderText('you@example.com'),
      'taylor@example.com',
    ),
  );
  await act(async () =>
    fireEvent.changeText(utils.getByPlaceholderText('Create a password'), 'password123'),
  );

  await act(async () => fireEvent.press(utils.getByText('Create Account')));
  expect(await utils.findByText(MESSAGE)).toBeTruthy();
  expect(auth.linkEmailIdentity).not.toHaveBeenCalled();

  // Another of the client's symbols: still refused.
  await act(async () => fireEvent.changeText(nameInput(), 'Taylor ✔'));
  await act(async () => fireEvent.press(utils.getByText('Create Account')));
  expect(utils.getByText(MESSAGE)).toBeTruthy();
  expect(auth.linkEmailIdentity).not.toHaveBeenCalled();

  // Taken out: the message goes and the account is created with the name as typed.
  await act(async () => fireEvent.changeText(nameInput(), 'Taylor'));
  await waitFor(() => expect(utils.queryByText(MESSAGE)).toBeNull());
  await act(async () => fireEvent.press(utils.getByText('Create Account')));
  await waitFor(() =>
    expect(auth.linkEmailIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Taylor', email: 'taylor@example.com' }),
    ),
  );
});
