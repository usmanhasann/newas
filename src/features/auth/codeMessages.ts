/**
 * What the 6-digit code screens say when a code doesn't work (client revisions 10/14 p.18-20):
 * email verification, change email and forgot password share them. Pure, so every message is
 * unit-tested. No dash punctuation in user-facing text; curly apostrophes as the app uses them.
 */

/**
 * Why a code email couldn't go out, or why an address can't take one: shared by email
 * verification, change email and forgot password.
 */
export function codeSendProblemMessage(
  reason:
    | 'too_many'
    | 'email_taken'
    | 'invalid_email'
    | 'not_configured'
    | 'send_failed'
    | 'unknown',
): string {
  switch (reason) {
    case 'too_many':
      return 'Please wait a moment before asking for another code.';
    case 'email_taken':
      return 'That email is already used by another LYSM account. Use a different email.';
    case 'invalid_email':
      return 'Enter a valid email address';
    case 'not_configured':
      return 'Email sending isn’t set up yet. Please try again later.';
    case 'send_failed':
      return 'We couldn’t send the email. Please try again.';
    default:
      return 'We couldn’t reach the server. Check your connection and try again.';
  }
}

export function triesLeft(n: number): string {
  return n === 1 ? '1 try left' : `${n} tries left`;
}

export function codeProblemMessage(
  reason: 'invalid' | 'expired' | 'locked' | 'no_code' | 'unknown',
  attemptsLeft?: number,
): string {
  switch (reason) {
    case 'invalid':
      return attemptsLeft !== undefined
        ? `That code isn’t right. You have ${triesLeft(attemptsLeft)}.`
        : 'That code isn’t right. Check the latest email and try again.';
    case 'expired':
      return 'That code has expired. Tap Resend code to get a new one.';
    case 'locked':
      return 'Too many wrong tries. Tap Resend code to get a new code.';
    case 'no_code':
      return 'That code was already used or replaced. Tap Resend code to get a new one.';
    default:
      return 'We couldn’t check the code. Check your connection and try again.';
  }
}

export const CODE_HINT =
  'The code expires in 10 minutes. Check your spam folder if you don’t see it.';

export function providerName(provider: 'google' | 'apple'): 'Google' | 'Apple' {
  return provider === 'google' ? 'Google' : 'Apple';
}

/**
 * Forgot password on a Google / Apple only account: no email is sent, the screen says why and
 * names the provider the account was created with (client revisions 10/14 p.20, exact text).
 */
export function providerOnlyResetMessage(provider: 'google' | 'apple'): string {
  const name = providerName(provider);
  return `This account uses ${name} sign-in, so there’s no password to reset. Sign in with ${name}, or set a password under Sign-in & Security once you’re in.`;
}
