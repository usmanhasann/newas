/**
 * Sign-in & Security for a Google only account (N5, client revisions 10/14 p.18-20): the email is
 * read-only (Google controls it), and the password row says "Set a password" instead of "Password".
 */
import { render, fireEvent } from '@testing-library/react-native';
import { SignInSecurityScreen } from '@features/security/screens/SignInSecurityScreen';

jest.mock('@features/security/hooks', () => ({
  useSignInMethods: () => ({
    data: { email: 'g@gmail.com', hasPassword: false, providers: ['google'] },
    isError: false,
    refetch: jest.fn(),
  }),
}));

describe('<SignInSecurityScreen /> — Google only account', () => {
  it('keeps the email read-only and offers "Set a password"', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, queryByText, getByLabelText } = await render(
      <SignInSecurityScreen navigation={navigation as never} route={{} as never} />,
    );

    expect(getByText('g@gmail.com')).toBeTruthy();
    expect(
      getByText('Your email comes from Google sign-in, so it’s managed there.'),
    ).toBeTruthy();
    const emailRow = getByLabelText(/^Email, g@gmail\.com/);
    expect(emailRow.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(getByText('g@gmail.com'));
    expect(navigation.navigate).not.toHaveBeenCalled();

    expect(queryByText('Password')).toBeNull();
    expect(getByText('Set a password')).toBeTruthy();
    expect(
      getByText(
        'Add a password so you can also sign in with your email. You’ll confirm with Google first.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Set a password'));
    expect(navigation.navigate).toHaveBeenCalledWith('SetPassword');
  });
});
