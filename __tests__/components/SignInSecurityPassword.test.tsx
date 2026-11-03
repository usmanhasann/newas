/**
 * Sign-in & Security for an email + password account (N5, client revisions 10/14 p.17): an
 * "Email" row (the address, opens Change email) and a "Password" row (opens Change password).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { SignInSecurityScreen } from '@features/security/screens/SignInSecurityScreen';

jest.mock('@features/security/hooks', () => ({
  useSignInMethods: () => ({
    data: { email: 'sam@example.com', hasPassword: true, providers: ['email', 'google'] },
    isError: false,
    refetch: jest.fn(),
  }),
}));

describe('<SignInSecurityScreen /> — email + password account', () => {
  it('shows the Email and Password rows and opens their screens', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, queryByText, getByLabelText } = await render(
      <SignInSecurityScreen navigation={navigation as never} route={{} as never} />,
    );

    expect(getByText('Sign-in & Security')).toBeTruthy();
    expect(getByText('Email')).toBeTruthy();
    expect(getByText('sam@example.com')).toBeTruthy();
    expect(getByText('Password')).toBeTruthy();
    expect(queryByText('Set a password')).toBeNull();

    await fireEvent.press(getByText('sam@example.com'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ChangeEmail');
    await fireEvent.press(getByText('Password'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ChangePassword');
    await fireEvent.press(getByLabelText('Go back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
