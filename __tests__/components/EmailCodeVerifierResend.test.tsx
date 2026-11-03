/**
 * "Resend code" (N5, client revisions 10/14 p.18, exact text) with a short cooldown: a new code goes
 * out, the countdown starts, and pressing again during it sends nothing.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailCodeVerifier } from '@features/email-verification/components/EmailCodeVerifier';
import { useEmailVerifyStore } from '@store/emailVerify';
import { useToastStore } from '@store/toast';

const mockRequest = jest.fn();
jest.mock('@features/email-verification/api', () => ({
  ...jest.requireActual('@features/email-verification/api'),
  requestVerificationCode: (...a: unknown[]) => mockRequest(...a),
  confirmVerificationCode: jest.fn(),
  refreshSession: jest.fn(),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<EmailCodeVerifier /> — Resend code', () => {
  it('sends a new code, then waits out the cooldown', async () => {
    // A code went out over a minute ago and still works: opening the screen keeps it.
    useEmailVerifyStore.getState().setLastSentAt(Date.now() - 61_000);
    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'active',
      email: 'sam@example.com',
    });
    const { getByText, queryByText } = await render(
      <QueryClientProvider client={new QueryClient()}>
        <EmailCodeVerifier onVerified={jest.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith({ mode: 'ensure' }));
    expect(queryByText(/You can ask for a new code/)).toBeNull();

    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'sent',
      email: 'sam@example.com',
    });
    await fireEvent.press(getByText('Resend code'));
    await waitFor(() => expect(mockRequest).toHaveBeenLastCalledWith({ mode: 'resend' }));
    await waitFor(() =>
      expect(getByText(/You can ask for a new code in \d+s\./)).toBeTruthy(),
    );
    expect(useToastStore.getState().message).toBe(
      'We sent a new code to sam@example.com.',
    );

    await fireEvent.press(getByText('Resend code'));
    expect(mockRequest).toHaveBeenCalledTimes(2); // cooldown: nothing sent
  });
});
