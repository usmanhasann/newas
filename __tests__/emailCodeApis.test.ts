/**
 * The app side of the 6-digit email codes (N5, client revisions 10/14 p.18-20): what the
 * verification and forgot password calls send to their Edge Functions, and how the answers map.
 */
import {
  confirmVerificationCode,
  requestVerificationCode,
} from '@features/email-verification/api';
import {
  completePasswordReset,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from '@features/auth/api';

const mockInvoke = jest.fn();
jest.mock('@lib', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) }, auth: {} },
}));

const reply = (data: unknown) => mockInvoke.mockResolvedValueOnce({ data, error: null });

beforeEach(() => jest.clearAllMocks());

describe('email verification at sign-up', () => {
  it('opening the screen asks for a code unless a live one exists ("ensure")', async () => {
    reply({ status: 'sent', email: 'sam@example.com' });
    expect(await requestVerificationCode({ mode: 'ensure' })).toEqual({
      ok: true,
      status: 'sent',
      email: 'sam@example.com',
    });
    expect(mockInvoke).toHaveBeenCalledWith('request-email-verification', {
      body: { mode: 'ensure' },
    });
  });

  it('"Wrong email? Change it." sends the corrected address', async () => {
    reply({ status: 'sent', email: 'sam@example.org' });
    await requestVerificationCode({ mode: 'resend', email: 'sam@example.org' });
    expect(mockInvoke).toHaveBeenCalledWith('request-email-verification', {
      body: { mode: 'resend', email: 'sam@example.org' },
    });
  });

  it('maps the resend cooldown and other refusals', async () => {
    reply({ error: 'too_many', retry_after: 37 });
    expect(await requestVerificationCode({ mode: 'resend' })).toEqual({
      ok: false,
      reason: 'too_many',
      retryAfter: 37,
    });
    reply({ error: 'email_taken' });
    expect(await requestVerificationCode({ mode: 'resend', email: 'x@y.co' })).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    reply({ status: 'already_verified' });
    expect(await requestVerificationCode({ mode: 'ensure' })).toEqual({
      ok: true,
      status: 'already_verified',
      email: undefined,
    });
  });

  it('confirm sends only the code', async () => {
    reply({ status: 'verified' });
    expect(await confirmVerificationCode('123456')).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith('confirm-email-verification', {
      body: { code: '123456' },
    });
    reply({ error: 'invalid', attempts_left: 2 });
    expect(await confirmVerificationCode('000000')).toEqual({
      ok: false,
      reason: 'invalid',
      attemptsLeft: 2,
    });
    reply({ error: 'locked' });
    expect(await confirmVerificationCode('000000')).toEqual({
      ok: false,
      reason: 'locked',
    });
  });
});

describe('forgot password by code', () => {
  it('request: a Google / Apple only account gets the provider back (no email sent)', async () => {
    reply({ status: 'provider_only', provider: 'apple' });
    expect(await requestPasswordResetCode('a@icloud.com')).toEqual({
      ok: true,
      status: 'provider_only',
      provider: 'apple',
    });
    expect(mockInvoke).toHaveBeenCalledWith('password-reset', {
      body: { action: 'request', email: 'a@icloud.com' },
    });
    reply({ status: 'sent' });
    expect(await requestPasswordResetCode('sam@example.com')).toEqual({
      ok: true,
      status: 'sent',
    });
  });

  it('verify returns the one-time reset token; complete sends it with the new password', async () => {
    reply({ status: 'verified', reset_token: 'tok' });
    expect(await verifyPasswordResetCode('sam@example.com', '123456')).toEqual({
      ok: true,
      resetToken: 'tok',
    });
    reply({ error: 'locked' });
    expect(await verifyPasswordResetCode('sam@example.com', '000000')).toEqual({
      ok: false,
      reason: 'locked',
    });
    reply({ status: 'reset' });
    expect(await completePasswordReset('sam@example.com', 'tok', 'new password')).toEqual(
      { ok: true },
    );
    expect(mockInvoke).toHaveBeenLastCalledWith('password-reset', {
      body: {
        action: 'complete',
        email: 'sam@example.com',
        reset_token: 'tok',
        new_password: 'new password',
      },
    });
    reply({ error: 'invalid_token' });
    expect(await completePasswordReset('sam@example.com', 'tok', 'new password')).toEqual(
      {
        ok: false,
        reason: 'invalid_token',
      },
    );
  });
});
