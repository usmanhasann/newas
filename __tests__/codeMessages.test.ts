/**
 * The shared 6-digit code messages and the Forgot password message for Google / Apple only accounts
 * (N5, client revisions 10/14 p.18-20).
 */
import {
  CODE_HINT,
  codeProblemMessage,
  codeSendProblemMessage,
  providerName,
  providerOnlyResetMessage,
  triesLeft,
} from '@features/auth/codeMessages';

describe('providerOnlyResetMessage (exact client text, p.20)', () => {
  it('Google', () => {
    expect(providerOnlyResetMessage('google')).toBe(
      'This account uses Google sign-in, so there’s no password to reset. Sign in with Google, or set a password under Sign-in & Security once you’re in.',
    );
  });

  it('Apple: both names swapped, nothing else', () => {
    expect(providerOnlyResetMessage('apple')).toBe(
      'This account uses Apple sign-in, so there’s no password to reset. Sign in with Apple, or set a password under Sign-in & Security once you’re in.',
    );
    expect(providerName('apple')).toBe('Apple');
  });
});

describe('codeProblemMessage', () => {
  it('counts tries down, and says what to do when a code expired, locked or was used', () => {
    expect(triesLeft(1)).toBe('1 try left');
    expect(triesLeft(3)).toBe('3 tries left');
    expect(codeProblemMessage('invalid', 3)).toBe(
      'That code isn’t right. You have 3 tries left.',
    );
    expect(codeProblemMessage('expired')).toBe(
      'That code has expired. Tap Resend code to get a new one.',
    );
    expect(codeProblemMessage('locked')).toBe(
      'Too many wrong tries. Tap Resend code to get a new code.',
    );
    expect(codeProblemMessage('no_code')).toBe(
      'That code was already used or replaced. Tap Resend code to get a new one.',
    );
  });

  it('tells people how long a code lasts', () => {
    expect(CODE_HINT).toContain('10 minutes');
    for (const m of [
      CODE_HINT,
      codeProblemMessage('unknown'),
      codeProblemMessage('invalid'),
    ]) {
      expect(m).not.toMatch(/[–—]| - /);
    }
  });
});

describe('codeSendProblemMessage (shared by every code screen)', () => {
  it('says why a code could not go out, the same way everywhere', () => {
    expect(codeSendProblemMessage('email_taken')).toBe(
      'That email is already used by another LYSM account. Use a different email.',
    );
    expect(codeSendProblemMessage('too_many')).toBe(
      'Please wait a moment before asking for another code.',
    );
    expect(codeSendProblemMessage('not_configured')).toBe(
      'Email sending isn’t set up yet. Please try again later.',
    );
    for (const r of ['invalid_email', 'send_failed', 'unknown'] as const) {
      expect(codeSendProblemMessage(r)).not.toMatch(/[–—]| - /);
    }
  });
});
