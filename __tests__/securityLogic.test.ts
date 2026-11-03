/**
 * Sign-in & Security rules and copy (N5, client revisions 10/14 p.17-21): which Email / Password
 * rows an account gets, the messages for every refusal, and the form schemas.
 */
import { isAppleRelayEmail, securityView } from '@features/security/logic';
import {
  SUPPORT_EMAIL,
  SUPPORT_POINTER,
  securityProblemMessage,
} from '@features/security/messages';
import {
  changeEmailSchema,
  changePasswordSchema,
  relayEmailSchema,
} from '@features/security/schema';
import type { SecurityProblem } from '@features/security/api';

describe('securityView', () => {
  it('an account with a password changes its email and its password', () => {
    expect(
      securityView({
        email: 'sam@example.com',
        hasPassword: true,
        providers: ['email', 'google'],
      }),
    ).toEqual({
      email: 'sam@example.com',
      hasPassword: true,
      originalProvider: 'google',
      relay: false,
      emailMode: 'change',
      passwordMode: 'change',
    });
  });

  it('a Google only account: email read-only, "Set a password" with Google', () => {
    const v = securityView({
      email: 'g@gmail.com',
      hasPassword: false,
      providers: ['google'],
    });
    expect(v.emailMode).toBe('readonly');
    expect(v.passwordMode).toBe('set');
    expect(v.originalProvider).toBe('google');
  });

  it('names the provider the account was created with (the oldest one)', () => {
    const v = securityView({
      email: 'a@icloud.com',
      hasPassword: false,
      providers: ['apple', 'google'],
    });
    expect(v.originalProvider).toBe('apple');
  });

  it('an Apple relay address is the one exception: it can be replaced', () => {
    const v = securityView({
      email: 'xyz123@privaterelay.appleid.com',
      hasPassword: false,
      providers: ['apple'],
    });
    expect(v).toMatchObject({ relay: true, emailMode: 'relay', passwordMode: 'set' });
    // A real Apple email (not a relay) stays read-only.
    expect(
      securityView({ email: 'me@icloud.com', hasPassword: false, providers: ['apple'] })
        .emailMode,
    ).toBe('readonly');
    // With a password, the normal change (current password) covers a relay address too.
    expect(
      securityView({
        email: 'xyz123@privaterelay.appleid.com',
        hasPassword: true,
        providers: ['apple', 'email'],
      }).emailMode,
    ).toBe('change');
  });

  it('recognises relay addresses only by their domain', () => {
    expect(isAppleRelayEmail(' XYZ@PrivateRelay.AppleID.com ')).toBe(true);
    expect(isAppleRelayEmail('privaterelay.appleid.com@gmail.com')).toBe(false);
    expect(isAppleRelayEmail(null)).toBe(false);
  });
});

describe('securityProblemMessage', () => {
  const all: SecurityProblem[] = [
    { reason: 'password_required' },
    { reason: 'wrong_password', attemptsLeft: 3 },
    { reason: 'wrong_password' },
    { reason: 'too_many_attempts' },
    { reason: 'too_many', retryAfter: 42 },
    { reason: 'too_many', retryAfter: 900 },
    { reason: 'email_taken' },
    { reason: 'same_email' },
    { reason: 'invalid_email' },
    { reason: 'read_only', provider: 'google' },
    { reason: 'read_only' },
    { reason: 'reauth_required', provider: 'apple' },
    { reason: 'wrong_provider', provider: 'google' },
    { reason: 'reauth_mismatch' },
    { reason: 'reauth_expired' },
    { reason: 'reauth_unavailable' },
    { reason: 'same_password' },
    { reason: 'weak_password' },
    { reason: 'invalid', attemptsLeft: 1 },
    { reason: 'expired' },
    { reason: 'locked' },
    { reason: 'no_code' },
    { reason: 'not_configured' },
    { reason: 'send_failed' },
    { reason: 'unknown' },
  ];

  it('says something specific for every refusal, without dash punctuation', () => {
    for (const p of all) {
      const m = securityProblemMessage(p);
      expect(m.length).toBeGreaterThan(5);
      expect(m).not.toMatch(/[–—]| - /);
      expect(m).not.toContain("'"); // curly apostrophes only
    }
  });

  it('blocks an address another account uses with a clear message (never merged)', () => {
    expect(securityProblemMessage({ reason: 'email_taken' })).toBe(
      'That email is already used by another LYSM account. Use a different email.',
    );
  });

  it('counts the password tries down and names the provider', () => {
    expect(securityProblemMessage({ reason: 'wrong_password', attemptsLeft: 1 })).toBe(
      'That password isn’t right. You have 1 try left.',
    );
    expect(securityProblemMessage({ reason: 'read_only', provider: 'apple' })).toBe(
      'Your email comes from Apple sign-in, so it can’t be changed here.',
    );
    expect(securityProblemMessage({ reason: 'invalid', attemptsLeft: 2 })).toBe(
      'That code isn’t right. You have 2 tries left.',
    );
  });

  it('points someone who lost both the password and the old inbox to support', () => {
    expect(SUPPORT_POINTER).toContain(SUPPORT_EMAIL);
    expect(SUPPORT_EMAIL).toBe('support@lysm.app');
    expect(SUPPORT_POINTER).not.toMatch(/[–—]| - /);
  });
});

describe('schemas', () => {
  it('change email needs the current password and a valid new address', () => {
    expect(
      changeEmailSchema.safeParse({ currentPassword: '', newEmail: 'a@b.co' }).success,
    ).toBe(false);
    expect(
      changeEmailSchema.safeParse({ currentPassword: 'x', newEmail: 'nope' }).success,
    ).toBe(false);
    expect(
      changeEmailSchema.parse({ currentPassword: 'x', newEmail: '  New@Example.COM ' })
        .newEmail,
    ).toBe('new@example.com');
    expect(relayEmailSchema.safeParse({ newEmail: 'me@gmail.com' }).success).toBe(true);
  });

  it('change password needs the current one, 8+ characters and a matching confirmation', () => {
    const ok = {
      currentPassword: 'old',
      password: 'brand new pass',
      confirm: 'brand new pass',
    };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: '' }).success).toBe(
      false,
    );
    expect(
      changePasswordSchema.safeParse({ ...ok, password: 'short', confirm: 'short' })
        .success,
    ).toBe(false);
    const mismatch = changePasswordSchema.safeParse({ ...ok, confirm: 'different pass' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirm']);
  });
});
