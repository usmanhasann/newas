import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '@features/auth/screens/SignInScreen';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));
// Non-resolving social so the busy handler suspends and no trailing state update escapes.
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  signInExistingWithApple: jest.fn(() => new Promise<void>(() => {})),
  signInExistingWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));

const social = jest.requireMock('@features/auth/social') as {
  signInExistingWithGoogle: jest.Mock;
};

// One async render per file (React 19 concurrent renders leak across sibling tests).
describe('<SignInScreen /> — provider chooser (Apple / Google / Email)', () => {
  it('shows only the provider options, routes Email, wires Google, back arrow and Get started', async () => {
    const { getByText, getByRole, queryByPlaceholderText } = await render(
      <SignInScreen />,
    );

    expect(getByText('Welcome back')).toBeTruthy();

    // The email/password form is on its own screen — it is NOT on the chooser.
    expect(queryByPlaceholderText('you@example.com')).toBeNull();
    expect(queryByPlaceholderText('Your password')).toBeNull();

    // "Continue with Email" routes to the email sign-in page. Asserted before the social press
    // below, which sets the busy state that (correctly) disables this button.
    await fireEvent.press(getByText('Continue with Email'));
    expect(mockNavigate).toHaveBeenCalledWith('EmailSignIn');

    // The back arrow (top left) returns to where the person came from (onboarding).
    await fireEvent.press(getByRole('button', { name: 'Go back' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    // "Get started" takes the person to onboarding (back to it).
    await fireEvent.press(getByText('Get started'));
    expect(mockGoBack).toHaveBeenCalledTimes(2);

    // Google authenticates the existing account directly.
    await fireEvent.press(getByText('Continue with Google'));
    await waitFor(() => expect(social.signInExistingWithGoogle).toHaveBeenCalledTimes(1));
  });
});
