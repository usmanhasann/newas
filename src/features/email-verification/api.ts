/**
 * Email-verification data access (client revisions 10/14 p.18). Verification state is read from
 * the server-side `email_verifications` table (the source of truth; it belongs to the address, so a
 * changed email is unverified again). Sending the 6-digit code and checking it happen in Edge
 * Functions (request-email-verification / confirm-email-verification). App-level outcomes come back
 * as 2xx bodies, mapped to typed results here.
 */
import { supabase } from '@lib';

// Cooldown math lives in a pure module so it can be unit-tested without the client.
export { RESEND_COOLDOWN_SECONDS, cooldownRemaining } from './cooldown';

/** Read the server's verification flag for a user. No row → not verified. */
export async function fetchEmailVerified(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_verifications')
    .select('verified')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.verified ?? false;
}

/**
 * Refresh the authenticated user from the provider (server) — NOT the cached session —
 * before checking status, per the verification requirements.
 */
export async function refreshAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

/** Pick up a new email on the session (after "Wrong email? Change it."). */
export async function refreshSession(): Promise<void> {
  await supabase.auth.refreshSession();
}

export type RequestResult =
  | { ok: true; status: 'sent' | 'active' | 'already_verified'; email?: string }
  | {
      ok: false;
      reason:
        | 'too_many'
        | 'email_taken'
        | 'invalid_email'
        | 'not_configured'
        | 'send_failed'
        | 'not_email_account'
        | 'unknown';
      retryAfter?: number;
    };

/**
 * mode 'ensure': send a code unless one that still works was already sent to this address (opening
 * the screen again never replaces the code the user is about to type). mode 'resend': "Resend
 * code". `email`: "Wrong email? Change it." (fixes the address, then a fresh code goes to it).
 */
export async function requestVerificationCode(opts: {
  mode: 'ensure' | 'resend';
  email?: string;
}): Promise<RequestResult> {
  const { data, error } = await supabase.functions.invoke('request-email-verification', {
    body: opts.email !== undefined ? { mode: 'resend', email: opts.email } : { mode: opts.mode },
  });
  if (error) return { ok: false, reason: 'unknown' };
  const b = (data ?? {}) as { status?: string; error?: string; retry_after?: number; email?: string };
  const email = typeof b.email === 'string' ? b.email : undefined;
  if (b.status === 'sent' || b.status === 'active' || b.status === 'already_verified') {
    return { ok: true, status: b.status, email };
  }
  const retryAfter = typeof b.retry_after === 'number' ? b.retry_after : undefined;
  if (b.error === 'too_many') return { ok: false, reason: 'too_many', retryAfter };
  if (b.error === 'email_taken') return { ok: false, reason: 'email_taken' };
  if (b.error === 'invalid_email') return { ok: false, reason: 'invalid_email' };
  if (b.error === 'email_not_configured') return { ok: false, reason: 'not_configured' };
  if (b.error === 'send_failed') return { ok: false, reason: 'send_failed' };
  if (b.error === 'not_email_account') return { ok: false, reason: 'not_email_account' };
  if (b.error === 'already_verified') return { ok: true, status: 'already_verified' };
  return { ok: false, reason: 'unknown' };
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' | 'no_code' | 'unknown'; attemptsLeft?: number };

export async function confirmVerificationCode(code: string): Promise<ConfirmResult> {
  const { data, error } = await supabase.functions.invoke('confirm-email-verification', {
    body: { code },
  });
  if (error) return { ok: false, reason: 'unknown' };
  const b = (data ?? {}) as { status?: string; error?: string; attempts_left?: number };
  if (b.status === 'verified') return { ok: true };
  if (b.error === 'invalid') {
    return {
      ok: false,
      reason: 'invalid',
      attemptsLeft: typeof b.attempts_left === 'number' ? b.attempts_left : undefined,
    };
  }
  if (b.error === 'expired' || b.error === 'locked' || b.error === 'no_code') {
    return { ok: false, reason: b.error };
  }
  return { ok: false, reason: 'unknown' };
}

/** Refresh the provider session, then read the authoritative verified flag. */
export async function checkVerified(userId: string): Promise<boolean> {
  await refreshAuthUser().catch(() => undefined); // refresh session; ignore transient errors
  return fetchEmailVerified(userId);
}
