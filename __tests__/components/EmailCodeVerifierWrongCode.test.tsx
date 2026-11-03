/**
 * Wrong email codes (N5, client revisions 10/14 p.18-20): the tries count down, and after too many
 * the code locks (ask for a new one). The step never hands over on a wrong code.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailCodeVerifier } from '@features/email-verification/components/EmailCodeVerifier';

const mockConfirm = jest.fn();
jest.mock('@features/email-verification/api', () => ({
  ...jest.requireActual('@features/email-verification/api'),
  requestVerificationCode: jest.fn(() =>
    Promise.resolve({ ok: true, status: 'active', email: 'sam@example.com' }),
  ),
  confirmVerificationCode: (...a: unknown[]) => mockConfirm(...a),
  refreshSession: jest.fn(),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<EmailCodeVerifier /> — wrong codes', () => {
  it('counts down, then says it is locked', async () => {
    const onVerified = jest.fn();
    const { getByText, getByLabelText } = await render(
      <QueryClientProvider client={new QueryClient()}>
        <EmailCodeVerifier onVerified={onVerified} />
      </QueryClientProvider>,
    );
    await fireEvent.changeText(getByLabelText('6-digit code'), '000000');

    mockConfirm.mockResolvedValueOnce({ ok: false, reason: 'invalid', attemptsLeft: 4 });
    await fireEvent.press(getByText('Verify'));
    await waitFor(() =>
      expect(getByText('That code isn’t right. You have 4 tries left.')).toBeTruthy(),
    );

    mockConfirm.mockResolvedValueOnce({ ok: false, reason: 'locked' });
    await fireEvent.press(getByText('Verify'));
    await waitFor(() =>
      expect(
        getByText('Too many wrong tries. Tap Resend code to get a new code.'),
      ).toBeTruthy(),
    );

    mockConfirm.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    await fireEvent.press(getByText('Verify'));
    await waitFor(() =>
      expect(
        getByText('That code has expired. Tap Resend code to get a new one.'),
      ).toBeTruthy(),
    );
    expect(onVerified).not.toHaveBeenCalled();
  });
});
