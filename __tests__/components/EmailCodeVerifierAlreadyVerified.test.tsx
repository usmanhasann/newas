/**
 * The code step for an email that is already verified (e.g. verified on another phone, or by a
 * password reset code): it hands over at once instead of asking for a code (N5).
 */
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailCodeVerifier } from '@features/email-verification/components/EmailCodeVerifier';

jest.mock('@features/email-verification/api', () => ({
  ...jest.requireActual('@features/email-verification/api'),
  requestVerificationCode: jest.fn(() =>
    Promise.resolve({ ok: true, status: 'already_verified' }),
  ),
  confirmVerificationCode: jest.fn(),
  refreshSession: jest.fn(),
}));
jest.mock('@store/session', () => ({
  ...jest.requireActual('@store/session'),
  useCurrentUser: () => ({ id: 'u1', email: 'sam@example.com' }),
}));

describe('<EmailCodeVerifier /> — already verified', () => {
  it('hands over once without a code', async () => {
    const qc = new QueryClient();
    const onVerified = jest.fn();
    await render(
      <QueryClientProvider client={qc}>
        <EmailCodeVerifier onVerified={onVerified} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData(['email-verified', 'u1'])).toBe(true);
  });
});
