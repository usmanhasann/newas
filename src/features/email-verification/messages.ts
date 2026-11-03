/**
 * What the verification screen says when a code email can't go out, or an address can't be used
 * (client revisions 10/14 p.18). Pure and unit-tested; no dash punctuation, curly apostrophes. The
 * reasons every code screen shares come from the auth feature's code messages.
 */
import { codeSendProblemMessage } from '@features/auth';

export function sendProblemMessage(
  reason:
    | 'too_many'
    | 'email_taken'
    | 'invalid_email'
    | 'not_configured'
    | 'send_failed'
    | 'not_email_account'
    | 'unknown',
): string {
  if (reason === 'not_email_account')
    return 'This account doesn’t use an email and password.';
  return codeSendProblemMessage(reason);
}
