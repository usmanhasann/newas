/**
 * Auth data-access. All calls go through the Supabase client (anon key + RLS).
 * No privileged work here.
 */
import { supabase } from '@lib';
import type { LoginInput, SignupInput } from './schema';

export async function signInWithPassword(input: LoginInput) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(input: SignupInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName,
        // Carried in user metadata; redeemed against circles in Phase 3.
        ...(input.inviteCode ? { invite_code: input.inviteCode } : {}),
      },
    },
  });
  if (error) throw error;

  // With email confirmation disabled, signUp returns a session and the user is logged
  // in immediately. If no session came back (confirmation still required, or the SDK
  // didn't return one), establish it now so the user flows straight into the app
  // rather than hitting a dead-end.
  if (!data.session) {
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signInError) throw signInError;
    return signedIn;
  }
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------------------------------------------------------------------------------------------
// Forgot password, by a 6-digit code (client revisions 10/14 p.20). The password-reset Edge
// Function does the work: no email for an address without an account (the answer is the same),
// none for a Google / Apple only account (it names the provider instead), codes expire, work once
// and lock after 5 wrong tries, and the reset signs out the account's other devices. App-level
// outcomes come back as 2xx bodies and are mapped to typed results here.
// ---------------------------------------------------------------------------------------------

export type SocialProviderId = 'google' | 'apple';

export type ResetRequestResult =
  | { ok: true; status: 'sent' }
  | { ok: true; status: 'provider_only'; provider: SocialProviderId }
  | {
      ok: false;
      reason: 'too_many' | 'invalid_email' | 'not_configured' | 'send_failed' | 'unknown';
      retryAfter?: number;
    };

export type ResetVerifyResult =
  | { ok: true; resetToken: string }
  | { ok: false; reason: 'invalid' | 'locked' | 'too_many' | 'unknown' };

export type ResetCompleteResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' | 'weak_password' | 'unknown' };

type Body = { status?: unknown; error?: unknown; provider?: unknown; retry_after?: unknown; reset_token?: unknown };

async function passwordResetCall(body: Record<string, unknown>): Promise<Body | null> {
  const { data, error } = await supabase.functions.invoke('password-reset', { body });
  if (error) return null;
  return (data ?? {}) as Body;
}

export async function requestPasswordResetCode(email: string): Promise<ResetRequestResult> {
  const b = await passwordResetCall({ action: 'request', email });
  if (!b) return { ok: false, reason: 'unknown' };
  if (b.status === 'sent') return { ok: true, status: 'sent' };
  if (b.status === 'provider_only' && (b.provider === 'google' || b.provider === 'apple')) {
    return { ok: true, status: 'provider_only', provider: b.provider };
  }
  const retryAfter = typeof b.retry_after === 'number' ? b.retry_after : undefined;
  if (b.error === 'too_many') return { ok: false, reason: 'too_many', retryAfter };
  if (b.error === 'invalid_email') return { ok: false, reason: 'invalid_email' };
  if (b.error === 'email_not_configured') return { ok: false, reason: 'not_configured' };
  if (b.error === 'send_failed') return { ok: false, reason: 'send_failed' };
  return { ok: false, reason: 'unknown' };
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<ResetVerifyResult> {
  const b = await passwordResetCall({ action: 'verify', email, code });
  if (!b) return { ok: false, reason: 'unknown' };
  if (b.status === 'verified' && typeof b.reset_token === 'string') {
    return { ok: true, resetToken: b.reset_token };
  }
  if (b.error === 'invalid') return { ok: false, reason: 'invalid' };
  if (b.error === 'locked') return { ok: false, reason: 'locked' };
  if (b.error === 'too_many') return { ok: false, reason: 'too_many' };
  return { ok: false, reason: 'unknown' };
}

export async function completePasswordReset(
  email: string,
  resetToken: string,
  newPassword: string,
): Promise<ResetCompleteResult> {
  const b = await passwordResetCall({
    action: 'complete',
    email,
    reset_token: resetToken,
    new_password: newPassword,
  });
  if (!b) return { ok: false, reason: 'unknown' };
  if (b.status === 'reset') return { ok: true };
  if (b.error === 'invalid_token') return { ok: false, reason: 'invalid_token' };
  if (b.error === 'weak_password') return { ok: false, reason: 'weak_password' };
  return { ok: false, reason: 'unknown' };
}

/**
 * Create an ANONYMOUS session so onboarding can run (and persist a real first entry)
 * before the user picks an auth method near the end of the flow (spec §17). At the auth
 * step the anonymous user is upgraded/linked to a permanent identity, preserving their
 * onboarding answers + first entry.
 * TODO(config): enable "Anonymous sign-ins" in Supabase Auth settings.
 */
export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

/**
 * Upgrade the current anonymous user to a permanent email/password identity (spec §3
 * email flow). Sends a confirmation email; the email-verification step follows (§16).
 */
export async function linkEmailIdentity(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const metadata: Record<string, string> = {};
  if (input.displayName) metadata.display_name = input.displayName;
  const { data, error } = await supabase.auth.updateUser({
    email: input.email,
    password: input.password,
    ...(Object.keys(metadata).length ? { data: metadata } : {}),
  });
  if (error) throw error;
  return data;
}

/**
 * Permanently delete the caller's account + personal data. Privileged work runs in the
 * `delete-account` Edge Function (service role): it revokes Sign in with Apple for an Apple account
 * (with the one-time code from the user's Apple confirmation), retains an anonymized billing record,
 * removes avatar files, then deletes the auth user (cascading all personal data). The function
 * only ever acts on the authenticated caller — it cannot delete anyone else's account.
 */
export async function deleteAccount(appleAuthorizationCode?: string) {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: appleAuthorizationCode ? { apple_authorization_code: appleAuthorizationCode } : {},
  });
  if (error) throw error;
}
