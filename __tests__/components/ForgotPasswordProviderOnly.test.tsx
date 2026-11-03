/**
 * Forgot password on a Google only account (N5, client revisions 10/14 p.20): no email is sent; the
 * request is blocked on screen with the exact client message naming the provider the account was
 * created with, so nobody waits for an email that will never come.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ForgotPasswordScreen } from '@features/auth/screens/ForgotPasswordScreen';

const mockRequest = jest.fn();
jest.mock('@features/auth/api', () => ({
  requestPasswordResetCode: (...a: unknown[]) => mockRequest(...a),
  verifyPasswordResetCode: jest.fn(),
  completePasswordReset: jest.fn(),
  signInWithPassword: jest.fn(),
}));
jest.mock('@features/auth/hooks', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), dispatch: jest.fn() }),
  useRoute: () => ({ params: undefined }),
  StackActions: { popTo: (name: string) => ({ type: 'POP_TO', payload: { name } }) },
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'anon', is_anonymous: true, email: null }),
}));

describe('<ForgotPasswordScreen /> — Google only account', () => {
  it('blocks the request with the exact message and never shows the code step', async () => {
    const { getByText, getByPlaceholderText, queryByText } = await render(
      <ForgotPasswordScreen />,
    );
    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'provider_only',
      provider: 'google',
    });
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'g@gmail.com');
    await fireEvent.press(getByText('Send code'));
    await waitFor(() =>
      expect(
        getByText(
          'This account uses Google sign-in, so there’s no password to reset. Sign in with Google, or set a password under Sign-in & Security once you’re in.',
        ),
      ).toBeTruthy(),
    );
    expect(mockRequest).toHaveBeenCalledWith('g@gmail.com');
    expect(queryByText('Check your email')).toBeNull();
  });
});
