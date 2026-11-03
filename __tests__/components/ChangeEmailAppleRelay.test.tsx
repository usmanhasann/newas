/**
 * Replacing an Apple "Hide My Email" relay address (N5, client revisions 10/14 p.21): no password
 * on the account, so Sign in with Apple confirms it's them instead; the code then goes to the new
 * (real) address like any email change. Dismissing Apple's sheet is not an error.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeEmailScreen } from '@features/security/screens/ChangeEmailScreen';

const mockRequest = jest.fn();
const mockReauth = jest.fn();
jest.mock('@features/security/api', () => ({
  requestEmailChange: (...a: unknown[]) => mockRequest(...a),
  confirmEmailChange: jest.fn(),
  refreshAccount: jest.fn(),
}));
jest.mock('@features/security/hooks', () => ({
  securityKeys: { methods: (uid?: string) => ['sign-in-methods', uid] },
  useSignInMethods: () => ({
    data: {
      email: 'xyz123@privaterelay.appleid.com',
      hasPassword: false,
      providers: ['apple'],
    },
  }),
}));
jest.mock('@features/auth', () => ({
  ...jest.requireActual('@features/auth'),
  reauthenticateWithProvider: (...a: unknown[]) => mockReauth(...a),
}));

describe('<ChangeEmailScreen /> — Apple relay address', () => {
  it('confirms with Apple, then sends the code to the real email', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText, queryByPlaceholderText, queryByText } =
      await render(
        <QueryClientProvider client={new QueryClient()}>
          <ChangeEmailScreen navigation={navigation as never} route={{} as never} />
        </QueryClientProvider>,
      );
    expect(queryByPlaceholderText('Your current password')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('you@example.com'), 'me@gmail.com');

    // Dismissing Apple's sheet: nothing sent, no error.
    mockReauth.mockRejectedValueOnce(
      Object.assign(new Error('The user canceled'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await fireEvent.press(getByText('Continue with Apple'));
    await waitFor(() => expect(mockReauth).toHaveBeenCalledWith('apple'));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(queryByText(/couldn’t confirm/)).toBeNull();

    const proof = { provider: 'apple', id_token: 'apple-token' };
    mockReauth.mockResolvedValueOnce(proof);
    mockRequest.mockResolvedValueOnce({ ok: true, email: 'me@gmail.com' });
    await fireEvent.press(getByText('Continue with Apple'));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({
        newEmail: 'me@gmail.com',
        reauth: proof,
      }),
    );
    await waitFor(() => expect(getByText('me@gmail.com')).toBeTruthy());
    expect(getByText('Confirm')).toBeTruthy();
  });
});
