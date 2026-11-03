/**
 * Change password → "Forgot your current password?" (N5, client revisions 10/14 p.19, exact text):
 * the same code reset as the sign-in page's "Forgot password", for this account's email.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { ChangePasswordScreen } from '@features/security/screens/ChangePasswordScreen';

jest.mock('@features/security/api', () => ({
  changePassword: jest.fn(),
  signInAgain: jest.fn(),
}));
jest.mock('@features/auth', () => ({
  ...jest.requireActual('@features/auth'),
  useSignOut: () => ({ mutate: jest.fn() }),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<ChangePasswordScreen /> — forgot the current password', () => {
  it('opens the code reset for this email', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText } = await render(
      <ChangePasswordScreen navigation={navigation as never} route={{} as never} />,
    );
    await fireEvent.press(getByText('Forgot your current password?'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', {
      email: 'sam@example.com',
    });
  });
});
