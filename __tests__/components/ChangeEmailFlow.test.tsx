/**
 * Change email (N5, client revisions 10/14 p.19): the current password first, then a code to the
 * NEW address only; nothing changes until the code is confirmed. On success the new address shows
 * everywhere (session refreshed) and counts as verified.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeEmailScreen } from '@features/security/screens/ChangeEmailScreen';
import { useToastStore } from '@store/toast';

const mockRequest = jest.fn();
const mockConfirm = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
jest.mock('@features/security/api', () => ({
  requestEmailChange: (...a: unknown[]) => mockRequest(...a),
  confirmEmailChange: (...a: unknown[]) => mockConfirm(...a),
  refreshAccount: () => mockRefresh(),
}));
jest.mock('@features/security/hooks', () => ({
  securityKeys: { methods: (uid?: string) => ['sign-in-methods', uid] },
  useSignInMethods: () => ({
    data: { email: 'sam@example.com', hasPassword: true, providers: ['email'] },
  }),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<ChangeEmailScreen /> — password account', () => {
  it('needs the password, sends the code to the new address, changes only on confirm', async () => {
    const qc = new QueryClient();
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText, queryByText, getByLabelText } = await render(
      <QueryClientProvider client={qc}>
        <ChangeEmailScreen navigation={navigation as never} route={{} as never} />
      </QueryClientProvider>,
    );

    expect(getByText('sam@example.com')).toBeTruthy(); // the current email

    // Nothing filled in: both fields say why, nothing is sent.
    await fireEvent.press(getByText('Send code'));
    expect(getByText('Enter your current password')).toBeTruthy();
    expect(getByText('Enter a valid email address')).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();

    mockRequest.mockResolvedValueOnce({ ok: true, email: 'new@example.com' });
    await fireEvent.changeText(
      getByPlaceholderText('Your current password'),
      'my password',
    );
    await fireEvent.changeText(
      getByPlaceholderText('you@example.com'),
      ' New@Example.com ',
    );
    await fireEvent.press(getByText('Send code'));
    expect(mockRequest).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      currentPassword: 'my password',
    });

    // The code step: the address the code went to, and the email stays the same until confirmed.
    await waitFor(() => expect(getByText('new@example.com')).toBeTruthy());
    expect(getByText(/Your email stays the same until you do\./)).toBeTruthy();
    expect(getByText('Resend code')).toBeTruthy();
    expect(getByText(/You can ask for a new code in \d+s\./)).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValueOnce({ ok: true, email: 'new@example.com' });
    await fireEvent.changeText(getByLabelText('6-digit code'), '123 456');
    await fireEvent.press(getByText('Confirm'));
    expect(mockConfirm).toHaveBeenCalledWith('new@example.com', '123456');
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockRefresh).toHaveBeenCalled();
    expect(qc.getQueryData(['email-verified', 'u1'])).toBe(true);
    expect(useToastStore.getState().message).toBe('Your email is now new@example.com.');
    expect(queryByText('Send code')).toBeNull();
  });
});
