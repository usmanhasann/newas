import { render, fireEvent } from '@testing-library/react-native';
import { EmailSignInScreen } from '@features/auth/screens/EmailSignInScreen';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));
const mockMutate = jest.fn();
jest.mock('@features/auth/hooks', () => ({
  useSignIn: () => ({ mutate: mockMutate, isPending: false, isError: false, error: null }),
}));

// One async render per file (React 19 concurrent renders leak across sibling tests).
describe('<EmailSignInScreen /> — the email + password login form', () => {
  it('shows the form and wires the forgot-password + back links', async () => {
    const { getByText, getByPlaceholderText, getByTestId, queryByText } = await render(
      <EmailSignInScreen />,
    );

    // The real LYSM app icon, as on Sign In (client 10/14 p.31), replaces the purple heart circle.
    expect(getByTestId('app-icon')).toBeTruthy();
    expect(queryByText('🤍')).toBeNull();

    // The login form lives here now (moved off the SignIn chooser).
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Your password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();

    // "Forgot password?" stays within the OnboardingFlow stack.
    await fireEvent.press(getByText('Forgot password?'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');

    // "Back to sign in options" returns to the chooser.
    await fireEvent.press(getByText('Back to sign in options'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
