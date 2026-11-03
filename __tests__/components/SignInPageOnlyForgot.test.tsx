/**
 * The sign-in page stays as it is (N5, client revisions 10/14 p.18): nothing for changing the email
 * or the password goes there (that is Sign-in & Security, signed in); it only has "Forgot password?"
 * for people who can't get in, which opens the code reset.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EmailSignInScreen } from '@features/auth/screens/EmailSignInScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
}));
jest.mock('@features/auth/hooks', () => ({
  useSignIn: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

describe('<EmailSignInScreen /> — only "Forgot password?"', () => {
  it('has no email or password change, and Forgot password opens the reset', async () => {
    const { getByText, queryByText } = await render(<EmailSignInScreen />);
    expect(queryByText(/change (your )?(email|password)/i)).toBeNull();
    expect(queryByText(/Sign-in & Security/)).toBeNull();
    expect(queryByText(/Set a password/)).toBeNull();
    await fireEvent.press(getByText('Forgot password?'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
