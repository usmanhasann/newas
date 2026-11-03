/**
 * What the Sign-in & Security screens say when a request is refused (client revisions 10/14
 * p.19-21). Pure, so every message is unit-tested. No dash punctuation in user-facing text; curly
 * apostrophes as the app uses them. Code problems reuse the shared code messages.
 */
import {
  codeProblemMessage,
  codeSendProblemMessage,
  linkProblemMessage,
  providerName,
  triesLeft,
} from '@features/auth';
import type { SecurityProblem } from './api';

export const SUPPORT_EMAIL = 'support@lysm.app';

/**
 * The one case the current password check can't cover (p.19): signed in, forgot the password AND
 * lost the old inbox. They go to support rather than weakening the check.
 */
export const SUPPORT_POINTER = `Forgot your password and can’t get into your current email either? Contact us at ${SUPPORT_EMAIL} and we’ll help.`;

export function securityProblemMessage(p: SecurityProblem): string {
  switch (p.reason) {
    case 'password_required':
      return 'Enter your current password.';
    case 'wrong_password':
      return p.attemptsLeft !== undefined
        ? `That password isn’t right. You have ${triesLeft(p.attemptsLeft)}.`
        : 'That password isn’t right.';
    case 'too_many_attempts':
      return 'Too many wrong tries. Please wait 15 minutes and try again.';
    case 'too_many':
      return p.retryAfter !== undefined && p.retryAfter <= 60
        ? `Please wait ${p.retryAfter} seconds and try again.`
        : 'Too many tries for now. Please wait a few minutes and try again.';
    case 'email_taken':
    case 'invalid_email':
    case 'send_failed':
    case 'not_configured':
      return codeSendProblemMessage(p.reason);
    case 'same_email':
      return 'That’s already your email.';
    case 'read_only':
      return p.provider
        ? `Your email comes from ${providerName(p.provider)} sign-in, so it can’t be changed here.`
        : 'Your email comes from your sign-in provider, so it can’t be changed here.';
    // Re-authentication: the same words as account linking's (one source).
    case 'reauth_required':
    case 'wrong_provider':
      return linkProblemMessage('wrong_provider', p.provider);
    case 'reauth_mismatch':
    case 'reauth_expired':
    case 'reauth_unavailable':
    case 'weak_password':
      return linkProblemMessage(p.reason);
    case 'same_password':
      return 'Your new password must be different from your current one.';
    case 'invalid':
      return codeProblemMessage('invalid', p.attemptsLeft);
    case 'expired':
    case 'locked':
    case 'no_code':
      return codeProblemMessage(p.reason);
    default:
      return codeSendProblemMessage('unknown');
  }
}
