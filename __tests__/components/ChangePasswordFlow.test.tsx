/**
 * Change password (N5, client revisions 10/14 p.19-20): the current password is required; after
 * the change the other devices are signed out while this one signs in again with the new password.
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
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<ChangePasswordScreen />', () => {
  it('checks the form, refuses a wrong current password, then updates and signs this device in again', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText } = await render(
      <ChangePasswordScreen navigation={navigation as never} route={{} as never} />,
    );
    expect(
      getByText(
        'You’ll stay signed in on this device. Your other devices will be signed out.',
      ),
    ).toBeTruthy();

    await fireEvent.press(getByText('Update Password'));
    expect(getByText('Enter your current password')).toBeTruthy();
    expect(mockChange).not.toHaveBeenCalled();

    await fireEvent.changeText(
      getByPlaceholderText('Your current password'),
      'old password',
    );
    await fireEvent.changeText(getByPlaceholderText('New password'), 'brand new pass');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'something else',
    );
    await fireEvent.press(getByText('Update Password'));
    expect(getByText('Passwords do not match')).toBeTruthy();
    expect(mockChange).not.toHaveBeenCalled();

    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'brand new pass',
    );
    mockChange.mockResolvedValueOnce({
      ok: false,
      reason: 'wrong_password',
      attemptsLeft: 4,
    });
    await fireEvent.press(getByText('Update Password'));
    await waitFor(() =>
      expect(getByText('That password isn’t right. You have 4 tries left.')).toBeTruthy(),
    );
    expect(mockSignInAgain).not.toHaveBeenCalled();

    mockChange.mockResolvedValueOnce({ ok: true, email: 'sam@example.com' });
    mockSignInAgain.mockResolvedValueOnce(true);
    await fireEvent.press(getByText('Update Password'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockChange).toHaveBeenLastCalledWith('old password', 'brand new pass');
    expect(mockSignInAgain).toHaveBeenCalledWith('sam@example.com', 'brand new pass');
    expect(useToastStore.getState().message).toBe(
      'Your password was updated. Your other devices were signed out.',
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
