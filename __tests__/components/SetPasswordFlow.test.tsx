/**
 * "Set a password" for a Google only account (N5, client revisions 10/14 p.20): first sign in again
 * with Google (the provider the account was created with), then create the password. A stale proof
 * asks for Google again. Afterwards the email (verified by Google) counts as verified and this
 * device signs in again with the new password.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SetPasswordScreen } from '@features/security/screens/SetPasswordScreen';
import { useToastStore } from '@store/toast';

const mockSet = jest.fn();
const mockSignInAgain = jest.fn();
const mockReauth = jest.fn();
jest.mock('@features/security/api', () => ({
  setPassword: (...a: unknown[]) => mockSet(...a),
  signInAgain: (...a: unknown[]) => mockSignInAgain(...a),
}));
jest.mock('@features/security/hooks', () => ({
  securityKeys: { methods: (uid?: string) => ['sign-in-methods', uid] },
  useSignInMethods: () => ({
    data: { email: 'g@gmail.com', hasPassword: false, providers: ['google', 'apple'] },
  }),
}));
jest.mock('@features/auth', () => ({
  ...jest.requireActual('@features/auth'),
  reauthenticateWithProvider: (...a: unknown[]) => mockReauth(...a),
  useSignOut: () => ({ mutate: jest.fn() }),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'g@gmail.com' }),
}));

describe('<SetPasswordScreen /> — Google only account', () => {
  it('re-authenticates with Google first, then sets the password', async () => {
    const qc = new QueryClient();
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText, queryByPlaceholderText } = await render(
      <QueryClientProvider client={qc}>
        <SetPasswordScreen navigation={navigation as never} route={{} as never} />
      </QueryClientProvider>,
    );

    // No password fields before Google confirms it's them.
    expect(queryByPlaceholderText('New password')).toBeNull();
    expect(
      getByText(
        'Your account was created with Google. To set a password, first confirm it’s you with Google.',
      ),
    ).toBeTruthy();

    const stale = { provider: 'google', id_token: 'old' };
    mockReauth.mockResolvedValueOnce(stale);
    await fireEvent.press(getByText('Continue with Google'));
    expect(mockReauth).toHaveBeenCalledWith('google', 'g@gmail.com');
    await waitFor(() => expect(getByPlaceholderText('New password')).toBeTruthy());
    expect(getByText('g@gmail.com')).toBeTruthy(); // the email they'll sign in with

    await fireEvent.changeText(getByPlaceholderText('New password'), 'first password');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'first password',
    );

    // Too slow: the server wants a fresh Google sign-in.
    mockSet.mockResolvedValueOnce({ ok: false, reason: 'reauth_expired' });
    await fireEvent.press(getByText('Set Password'));
    await waitFor(() =>
      expect(
        getByText('That took too long. Please confirm it’s you again.'),
      ).toBeTruthy(),
    );
    expect(getByText('Continue with Google')).toBeTruthy();

    const fresh = { provider: 'google', id_token: 'fresh' };
    mockReauth.mockResolvedValueOnce(fresh);
    await fireEvent.press(getByText('Continue with Google'));
    await waitFor(() => expect(getByPlaceholderText('New password')).toBeTruthy());
    await fireEvent.changeText(getByPlaceholderText('New password'), 'first password');
    await fireEvent.changeText(
      getByPlaceholderText('Re-enter new password'),
      'first password',
    );
    mockSet.mockResolvedValueOnce({ ok: true, email: 'g@gmail.com' });
    mockSignInAgain.mockResolvedValueOnce(true);
    await fireEvent.press(getByText('Set Password'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

    expect(mockSet).toHaveBeenLastCalledWith('first password', fresh);
    expect(qc.getQueryData(['email-verified', 'u1'])).toBe(true);
    expect(mockSignInAgain).toHaveBeenCalledWith('g@gmail.com', 'first password');
    expect(useToastStore.getState().message).toBe(
      'Your password is set. You can now sign in with your email and password too.',
    );
  });
});
