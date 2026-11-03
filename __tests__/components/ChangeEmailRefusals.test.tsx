/**
 * Change email refusals (N5, client revisions 10/14 p.19): a wrong current password counts down,
 * and an address that already belongs to another LYSM account is blocked with a clear message
 * (the accounts are never merged). The person stays on the form.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeEmailScreen } from '@features/security/screens/ChangeEmailScreen';

const mockRequest = jest.fn();
jest.mock('@features/security/api', () => ({
  requestEmailChange: (...a: unknown[]) => mockRequest(...a),
  confirmEmailChange: jest.fn(),
  refreshAccount: jest.fn(),
}));
jest.mock('@features/security/hooks', () => ({
  securityKeys: { methods: (uid?: string) => ['sign-in-methods', uid] },
  useSignInMethods: () => ({
    data: { email: 'sam@example.com', hasPassword: true, providers: ['email'] },
  }),
}));

describe('<ChangeEmailScreen /> — refusals', () => {
  it('shows the wrong password and the taken address next to their fields', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getByPlaceholderText, queryByText } = await render(
      <QueryClientProvider client={new QueryClient()}>
        <ChangeEmailScreen navigation={navigation as never} route={{} as never} />
      </QueryClientProvider>,
    );
    await fireEvent.changeText(getByPlaceholderText('Your current password'), 'nope');
    await fireEvent.changeText(
      getByPlaceholderText('you@example.com'),
      'taken@example.com',
    );

    mockRequest.mockResolvedValueOnce({
      ok: false,
      reason: 'wrong_password',
      attemptsLeft: 4,
    });
    await fireEvent.press(getByText('Send code'));
    await waitFor(() =>
      expect(getByText('That password isn’t right. You have 4 tries left.')).toBeTruthy(),
    );

    mockRequest.mockResolvedValueOnce({ ok: false, reason: 'email_taken' });
    await fireEvent.press(getByText('Send code'));
    await waitFor(() =>
      expect(
        getByText(
          'That email is already used by another LYSM account. Use a different email.',
        ),
      ).toBeTruthy(),
    );
    expect(queryByText('Confirm')).toBeNull(); // still on the form
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
