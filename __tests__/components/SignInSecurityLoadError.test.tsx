/**
 * Sign-in & Security when the account's sign-in details can't be loaded (offline): a clear message
 * and a retry, never an empty screen (N5).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { SignInSecurityScreen } from '@features/security/screens/SignInSecurityScreen';

const mockRefetch = jest.fn();
jest.mock('@features/security/hooks', () => ({
  useSignInMethods: () => ({ data: undefined, isError: true, refetch: mockRefetch }),
}));

describe('<SignInSecurityScreen /> — load error', () => {
  it('says what happened and retries', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, queryByText } = await render(
      <SignInSecurityScreen navigation={navigation as never} route={{} as never} />,
    );
    expect(
      getByText(
        'We couldn’t load your sign-in details. Check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(queryByText('Email')).toBeNull();
    await fireEvent.press(getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
