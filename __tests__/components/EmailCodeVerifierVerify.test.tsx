/**
 * The 6-digit email code step (N5, client revisions 10/14 p.18): on open it makes sure a code went
 * out (never replacing a live one), names the address, and verifies the typed code. On success the
 * cached verified flag is set and the step hands over once.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailCodeVerifier } from '@features/email-verification/components/EmailCodeVerifier';
import { useEmailVerifyStore } from '@store/emailVerify';

const mockRequest = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@features/email-verification/api', () => ({
  ...jest.requireActual('@features/email-verification/api'),
  requestVerificationCode: (...a: unknown[]) => mockRequest(...a),
  confirmVerificationCode: (...a: unknown[]) => mockConfirm(...a),
  refreshSession: jest.fn(() => Promise.resolve()),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<EmailCodeVerifier /> — verify', () => {
  it('sends a code on open, then verifies the typed code', async () => {
    const qc = new QueryClient();
    const onVerified = jest.fn();
    mockRequest.mockResolvedValueOnce({
      ok: true,
      status: 'sent',
      email: 'sam@example.com',
    });
    const { getByText, getByLabelText } = await render(
      <QueryClientProvider client={qc}>
        <EmailCodeVerifier onVerified={onVerified} />
      </QueryClientProvider>,
    );
    expect(mockRequest).toHaveBeenCalledWith({ mode: 'ensure' });
    expect(getByText('sam@example.com')).toBeTruthy();
    await waitFor(() =>
      expect(getByText(/You can ask for a new code in \d+s\./)).toBeTruthy(),
    );
    expect(
      getByText(
        'The code expires in 10 minutes. Check your spam folder if you don’t see it.',
      ),
    ).toBeTruthy();

    // Not six digits yet: nothing is checked.
    await fireEvent.changeText(getByLabelText('6-digit code'), '123');
    await fireEvent.press(getByText('Verify'));
    expect(mockConfirm).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValueOnce({ ok: true });
    await fireEvent.changeText(getByLabelText('6-digit code'), '123456');
    await fireEvent.press(getByText('Verify'));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(mockConfirm).toHaveBeenCalledWith('123456');
    expect(qc.getQueryData(['email-verified', 'u1'])).toBe(true);
    expect(useEmailVerifyStore.getState().lastSentAt).toBeNull();
  });
});
