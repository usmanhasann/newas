/**
 * Sign-in & Security for an Apple only account with a "Hide My Email" relay address (N5, client
 * revisions 10/14 p.21): the one exception to read-only, it can be replaced with a real email.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { SignInSecurityScreen } from '@features/security/screens/SignInSecurityScreen';

jest.mock('@features/security/hooks', () => ({
  useSignInMethods: () => ({
    data: {
      email: 'xyz123@privaterelay.appleid.com',
      hasPassword: false,
      providers: ['apple'],
    },
    isError: false,
    refetch: jest.fn(),
  }),
}));

describe('<SignInSecurityScreen /> — Apple relay address', () => {
  it('lets the relay address be replaced and offers "Set a password" with Apple', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText } = await render(
      <SignInSecurityScreen navigation={navigation as never} route={{} as never} />,
    );

    expect(
      getByText('Apple’s private relay address. Tap to use your real email instead.'),
    ).toBeTruthy();
    await fireEvent.press(getByText('xyz123@privaterelay.appleid.com'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ChangeEmail');
    expect(
      getByText(
        'Add a password so you can also sign in with your email. You’ll confirm with Apple first.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Set a password'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SetPassword');
  });
});
