/**
 * "Forgot your current password?" from Sign-in & Security (N5, client revisions 10/14 p.19-20): the
 * same code reset for the signed-in account's email (not editable). The reset signs out every
 * session; this device signs in again with the new password and goes back to Sign-in & Security.
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
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: jest.fn(),
    dispatch: mockDispatch,
  }),
  useRoute: () => ({ params: { email: 'sam@example.com' } }),
  StackActions: { popTo: (name: string) => ({ type: 'POP_TO', payload: { name } }) },
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', is_anonymous: false, email: 'sam@example.com' }),
}));

describe('<ForgotPasswordScreen /> — from Sign-in & Security', () => {
  it('resets the signed-in account’s password and returns to Sign-in & Security', async () => {
    const { getByText, getByPlaceholderText, getByLabelText, getByDisplayValue } =
      await render(<ForgotPasswordScreen />);
    expect(getByDisplayValue('sam@example.com').props.editable).toBe(false);

    mockRequest.mockResolvedValueOnce({ ok: true, status: 'sent' });
    await fireEvent.press(getByText('Send code'));
    await waitFor(() =>
      expect(getByText('We sent a 6-digit code to sam@example.com.')).toBeTruthy(),
    );

    mockVerify.mockResolvedValueOnce({ ok: true, resetToken: 't' });
    await fireEvent.changeText(getByLabelText('6-digit code'), '123456');
    await fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Choose a new password')).toBeTruthy());

    mockComplete.mockResolvedValueOnce({ ok: true });
    mockSignIn.mockResolvedValueOnce({});
    await fireEvent.changeText(getByPlaceholderText('New password'), 'my new password');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'my new password',
    );
    await fireEvent.press(getByText('Update Password'));
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'POP_TO',
        payload: { name: 'SignInSecurity' },
      }),
    );
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'my new password',
    });
    expect(useToastStore.getState().message).toBe(
      'Your password was updated. Your other devices were signed out.',
    );
  });
});
