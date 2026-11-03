/**
 * Whether a sign-in failed because the person already has a LYSM account: `identity` = this
 * Google / Apple account already belongs to one, `email` = its email address already does. The
 * sign-up screen sends them to Sign In for these. A native Google / Apple sign-in is checked before
 * it gets here and offers linking instead (N4, linkFlow.ts); these remain for the browser Google
 * fallback, which the auth server finishes by itself.
 */
export function existingAccountKind(error: unknown): 'identity' | 'email' | null {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  if (code === 'identity_already_exists' || /already (linked|associated)/.test(message)) {
    return 'identity';
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    /already (been )?registered/.test(message)
  ) {
    return 'email';
  }
  return null;
}

/**
 * The message for a Google / Apple sign-in that didn't work (client 10/14 p.15: never block the
 * user silently, always say what happened).
 */
export function socialSignInMessage(
  error: unknown,
  provider: 'Google' | 'Apple',
): string {
  const linkMessage = accountLinkCheckMessage(error, provider);
  if (linkMessage) return linkMessage;
  const existing = existingAccountKind(error);
  if (existing === 'identity') {
    return `This ${provider} account already has a LYSM account. Sign in to use it.`;
  }
  if (existing === 'email') {
    return 'An account with this email already exists. Sign in with the method you used to create it.';
  }
  const e = error as { message?: unknown } | null | undefined;
  const message = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  if (/network|fetch/.test(message)) {
    return 'We couldn’t reach the server. Check your connection and try again.';
  }
  return `${provider} sign-in didn’t complete. Please try again.`;
}

/**
 * The account linking pre-check's own answers (client 10/14 p.15-16 and p.19, N4), or null for any
 * other error. Only verified emails start linking, so a sign-in whose email matches an unverified
 * account (or one the provider didn't verify) is told what to do instead of being merged.
 */
function accountLinkCheckMessage(
  error: unknown,
  provider: 'Google' | 'Apple',
): string | null {
  const e = error as { code?: unknown } | null | undefined;
  switch (typeof e?.code === 'string' ? e.code : '') {
    case 'email_unverified':
      return `There’s a LYSM account with this email that hasn’t been verified yet. Sign in to it with its email and password first, then you can add ${provider}.`;
    case 'provider_email_unverified':
      return `${provider} hasn’t verified the email on this account, so we can’t match it to your LYSM account. Sign in the way you usually do.`;
    case 'link_too_many':
      return 'A few too many attempts. Please wait a moment and try again.';
    case 'link_not_configured':
      return `${provider} sign-in isn’t available right now. Please choose another way to sign in.`;
    case 'link_unavailable':
      return 'We couldn’t reach the server. Check your connection and try again.';
    default:
      return null;
  }
}

/**
 * Map raw Supabase auth errors to warm, non-clinical copy (design spec §8 — tone).
 */
export function authErrorMessage(error: unknown): string {
  if (!error) return '';
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error);
  const m = raw.toLowerCase();

  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'That email or password doesn’t match. Please try again.';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first, then sign in.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'A few too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'We couldn’t reach the server. Check your connection and try again.';
  }
  return raw || 'Something went wrong. Please try again.';
}
