/**
 * Change password when this device can't sign in again afterwards (e.g. the connection dropped):
 * the password did change and every session was signed out, so the person is told and signed out
 * cleanly instead of being left with a dead session (N5).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ChangePasswordScreen } from '@features/security/screens/ChangePasswordScreen';
import { useToastStore } from '@store/toast';

const mockChange = jest.fn();
const mockSignInAgain = jest.fn();
jest.mock('@features/security/api', () => ({
  changePassword: (...a: unknown[]) => mockChange(...a),
  signInAgain: (...a: unknown[]) => mockSignInAgain(...a),
}));
const mockSignOut = jest.fn();
jest.mock('@features/auth', () => ({
  ...jest.requireActual('@features/auth'),
  useSignOut: () => ({ mutate: mockSignOut }),
}));

describe('<ChangePasswordScreen /> — signing in again fails', () => {
  it('says so and signs out', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText } = await render(
      <ChangePasswordScreen navigation={navigation as never} route={{} as never} />,
    );
    await fireEvent.changeText(
      getByPlaceholderText('Your current password'),
      'old password',
    );
    await fireEvent.changeText(getByPlaceholderText('New password'), 'brand new pass');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'brand new pass',
    );
    mockChange.mockResolvedValueOnce({ ok: true, email: 'sam@example.com' });
    mockSignInAgain.mockResolvedValueOnce(false);
    await fireEvent.press(getByText('Update Password'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(useToastStore.getState().message).toBe(
      'Your password was updated. Please sign in again with your new password.',
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
