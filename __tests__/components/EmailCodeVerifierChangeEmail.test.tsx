/**
 * "Wrong email? Change it." (N5, client revisions 10/14 p.18, exact text): fixes a typo by updating
 * the email on the unverified account and sending a fresh code to it. An address another account
 * uses is refused on the spot.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailCodeVerifier } from '@features/email-verification/components/EmailCodeVerifier';
import { useToastStore } from '@store/toast';

const mockRequest = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
jest.mock('@features/email-verification/api', () => ({
  ...jest.requireActual('@features/email-verification/api'),
  requestVerificationCode: (...a: unknown[]) => mockRequest(...a),
  confirmVerificationCode: jest.fn(),
  refreshSession: () => mockRefresh(),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@exmaple.com' }),
}));

describe('<EmailCodeVerifier /> — Wrong email? Change it.', () => {
  it('moves the code to the corrected address', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'sent',
      email: 'sam@exmaple.com',
    });
    const { getByText, getByPlaceholderText, queryByText } = await render(
      <QueryClientProvider client={new QueryClient()}>
        <EmailCodeVerifier onVerified={jest.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(getByText('sam@exmaple.com')).toBeTruthy());

    await fireEvent.press(getByText('Wrong email? Change it.'));
    expect(
      getByText('Enter the right email and we’ll send a new code to it.'),
    ).toBeTruthy();

    mockRequest.mockResolvedValueOnce({ ok: false, reason: 'email_taken' });
    await fireEvent.changeText(
      getByPlaceholderText('you@example.com'),
      'taken@example.com',
    );
    await fireEvent.press(getByText('Send code'));
    await waitFor(() =>
      expect(
        getByText(
          'That email is already used by another LYSM account. Use a different email.',
        ),
      ).toBeTruthy(),
    );
    expect(mockRefresh).not.toHaveBeenCalled();

    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'sent',
      email: 'sam@example.com',
    });
    await fireEvent.changeText(
      getByPlaceholderText('you@example.com'),
      'Sam@Example.com',
    );
    await fireEvent.press(getByText('Send code'));
    expect(mockRequest).toHaveBeenLastCalledWith({
      mode: 'resend',
      email: 'sam@example.com',
    });
    await waitFor(() => expect(getByText('sam@example.com')).toBeTruthy());
    expect(mockRefresh).toHaveBeenCalled(); // the session now carries the corrected email
    expect(queryByText('sam@exmaple.com')).toBeNull();
    expect(useToastStore.getState().message).toBe(
      'We sent a new code to sam@example.com.',
    );
  });
});
