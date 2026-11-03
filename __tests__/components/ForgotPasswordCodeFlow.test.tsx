/**
 * Forgot password from the sign-in page, by a 6-digit code (N5, client revisions 10/14 p.20): the
 * screen never says whether an account exists, a wrong code is refused, and after the new password
 * is chosen this device signs in with it (the reset signed every session out).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ForgotPasswordScreen } from '@features/auth/screens/ForgotPasswordScreen';
import { useToastStore } from '@store/toast';

const mockRequest = jest.fn();
const mockVerify = jest.fn();
const mockComplete = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@features/auth/api', () => ({
  requestPasswordResetCode: (...a: unknown[]) => mockRequest(...a),
  verifyPasswordResetCode: (...a: unknown[]) => mockVerify(...a),
  completePasswordReset: (...a: unknown[]) => mockComplete(...a),
  signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
}));
jest.mock('@features/auth/hooks', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: jest.fn(),
    dispatch: mockDispatch,
  }),
  useRoute: () => ({ params: undefined }),
  StackActions: { popTo: (name: string) => ({ type: 'POP_TO', payload: { name } }) },
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'anon', is_anonymous: true, email: null }),
}));

describe('<ForgotPasswordScreen /> — signed out', () => {
  it('email → code → new password → signed in with it', async () => {
    const { getByText, getByPlaceholderText, getByLabelText } = await render(
      <ForgotPasswordScreen />,
    );

    mockRequest.mockResolvedValueOnce({ ok: true, status: 'sent' });
    await fireEvent.changeText(
      getByPlaceholderText('you@example.com'),
      'Sam@Example.com',
    );
    await fireEvent.press(getByText('Send code'));
    await waitFor(() => expect(getByText('Check your email')).toBeTruthy());
    // The same answer whether or not there is an account for it.
    expect(
      getByText(
        'If there’s a LYSM account for sam@example.com, we sent a 6-digit code to it.',
      ),
    ).toBeTruthy();
    expect(getByText('Resend code')).toBeTruthy();

    mockVerify.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    await fireEvent.changeText(getByLabelText('6-digit code'), '000000');
    await fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      expect(
        getByText('That code isn’t right. Check the latest email and try again.'),
      ).toBeTruthy(),
    );

    mockVerify.mockResolvedValueOnce({ ok: true, resetToken: 'reset-tok' });
    await fireEvent.changeText(getByLabelText('6-digit code'), '123456');
    await fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Choose a new password')).toBeTruthy());
    expect(mockVerify).toHaveBeenLastCalledWith('sam@example.com', '123456');

    mockComplete.mockResolvedValueOnce({ ok: true });
    mockSignIn.mockResolvedValueOnce({});
    await fireEvent.changeText(getByPlaceholderText('New password'), 'my new password');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'my new password',
    );
    await fireEvent.press(getByText('Update Password'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockComplete).toHaveBeenCalledWith(
      'sam@example.com',
      'reset-tok',
      'my new password',
    );
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'my new password',
    });
    expect(useToastStore.getState().message).toBe('Your password was updated.');
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled(); // signed in: the app opens the account
  });
});
