/**
 * What the account linking screens say (client revisions 10/14 p.15-16, N4). Pure, so every line is
 * unit-tested. No dash punctuation in user-facing text; curly apostrophes as the app uses them.
 */
import type { LinkProblem } from './linkApi';
import type { PendingLink, SocialProviderId } from './linking';
import { providerName } from './codeMessages';

/** "Apple ID" / "Google account": what the person signed in with. */
function providerAccount(provider: SocialProviderId): string {
  return provider === 'apple' ? 'Apple ID' : 'Google account';
}

/** "Already have a LYSM account?" (p.16): asked before a second account is created. */
export const HAVE_ACCOUNT_TITLE = 'Already have a LYSM account?';

export function haveAccountMessage(
  link: Extract<PendingLink, { kind: 'fallback' }>,
): string {
  const name = providerName(link.attempt.provider);
  if (link.relay) {
    return `This Apple ID hides its email, so we couldn’t match it to a LYSM account. If you already have one, sign in to it and we’ll add ${name} to it.`;
  }
  return `We didn’t find a LYSM account for this ${providerAccount(link.attempt.provider)}. If you already have one, sign in to it and we’ll add ${name} to it.`;
}

/** The headline and the line under it on "Link your account", per step. */
export function linkScreenCopy(
  link: PendingLink,
  step: 'prove' | 'password' = 'prove',
): { title: string; subtitle: string } {
  if (link.kind === 'set_password') {
    const name = providerName(link.provider);
    return step === 'password'
      ? {
          title: 'Create a password',
          subtitle: `Thanks, that’s confirmed. Create a password for ${link.email}. You can keep using ${name} too.`,
        }
      : {
          title: 'Confirm it’s you',
          subtitle: `${link.email} signs in with ${name}. Continue with ${name} to confirm it’s you, then create a password so you can also sign in with your email.`,
        };
  }
  const adding = providerName(link.attempt.provider);
  if (link.kind === 'fallback') {
    return {
      title: 'Link your account',
      subtitle: `Sign in to your LYSM account the way you usually do, and we’ll add ${adding} to it.`,
    };
  }
  if (link.method === 'password') {
    return {
      title: 'Link your account',
      subtitle: `There’s already a LYSM account for ${link.email}. Enter its password to confirm it’s you, and we’ll add ${adding} to it.`,
    };
  }
  const original = providerName(link.method);
  return {
    title: 'Link your account',
    subtitle: `There’s already a LYSM account for ${link.email} that signs in with ${original}. Continue with ${original} to confirm it’s you, and we’ll add ${adding} to it.`,
  };
}

/** After the link: the new sign-in now opens the same account. */
export function linkedMessage(provider: SocialProviderId): string {
  return `You’re in. ${providerName(provider)} now opens this account too.`;
}

/** Signed in to the account, but the new sign-in couldn't be added this time. */
export function notLinkedMessage(provider: SocialProviderId): string {
  const name = providerName(provider);
  return `You’re signed in, but we couldn’t add ${name} this time. Try ${name} again next time you sign in.`;
}

export const PASSWORD_SET_MESSAGE =
  'Your password is set. You can now sign in with your email and password too.';
export const PASSWORD_SET_SIGN_IN_MESSAGE =
  'Your password is set. Please sign in with your email and new password.';
export const WRONG_PASSWORD_MESSAGE = 'That password isn’t right. Please try again.';

/** Why a step of the linking flow didn't work. */
export function linkProblemMessage(
  reason: LinkProblem | 'no_account' | 'wrong_password',
  provider?: SocialProviderId,
): string {
  const name = provider ? providerName(provider) : null;
  switch (reason) {
    case 'wrong_password':
      return WRONG_PASSWORD_MESSAGE;
    case 'no_account':
      return name
        ? `We couldn’t find a LYSM account for that ${providerAccount(provider!)}. Try another way to sign in.`
        : 'We couldn’t find a LYSM account for that sign-in. Try another way to sign in.';
    case 'reauth_mismatch':
      return 'That isn’t the account linked to LYSM. Try again with the account you use for LYSM.';
    case 'wrong_provider':
      return name
        ? `Please confirm with ${name}, the sign-in this account was created with.`
        : 'Please confirm with the sign-in this account was created with.';
    case 'reauth_expired':
    case 'invalid_ticket':
      return 'That took too long. Please confirm it’s you again.';
    case 'reauth_unavailable':
      return 'We couldn’t confirm it’s you right now. Please try again later.';
    case 'too_many_attempts':
      return 'Too many tries. Please wait 15 minutes and try again.';
    case 'too_many':
      return 'Too many tries for now. Please wait a few minutes and try again.';
    case 'has_password':
      return 'This account already has a password. Sign in with your email and password.';
    case 'weak_password':
      return 'Use at least 8 characters';
    default:
      return 'Something went wrong. Please try again.';
  }
}
