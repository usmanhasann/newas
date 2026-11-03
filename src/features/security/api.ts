/**
 * Sign-in & Security data access (client revisions 10/14 p.17-21). The app's own sign-in methods
 * come from the `my_sign_in_methods` RPC (it reads only the caller's row); every change goes through
 * an Edge Function that checks it again on the server: change-email (current password first, code to
 * the NEW address only) and update-password (current password, or a fresh sign-in with the provider
 * the account was created with). App-level outcomes come back as 2xx bodies, mapped to typed results
 * here. Nothing here ever logs a password, a code or a token.
 */
import { supabase } from '@lib';
import type { ReauthProof } from '@features/auth';

export interface SignInMethods {
  email: string | null;
  hasPassword: boolean;
  /** Oldest first: the first Google / Apple one is the provider the account was created with. */
  providers: string[];
}

export async function fetchSignInMethods(): Promise<SignInMethods> {
  const { data, error } = await supabase.rpc('my_sign_in_methods');
  if (error) throw error;
  return {
    email: data?.email ?? null,
    hasPassword: data?.has_password === true,
    providers: Array.isArray(data?.providers) ? data.providers : [],
  };
}

type Body = {
  status?: unknown;
  error?: unknown;
  provider?: unknown;
  attempts_left?: unknown;
  retry_after?: unknown;
  email?: unknown;
};

async function invoke(
  fn: 'change-email' | 'update-password',
  body: Record<string, unknown>,
) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) return null;
  return (data ?? {}) as Body;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const provider = (v: unknown): 'google' | 'apple' | undefined =>
  v === 'google' || v === 'apple' ? v : undefined;

/** Why a security request was refused (shared by change email and the password screens). */
export type SecurityProblem =
  | { reason: 'password_required' }
  | { reason: 'wrong_password'; attemptsLeft?: number }
  | { reason: 'too_many_attempts' }
  | { reason: 'too_many'; retryAfter?: number }
  | { reason: 'email_taken' }
  | { reason: 'same_email' }
  | { reason: 'invalid_email' }
  | { reason: 'read_only'; provider?: 'google' | 'apple' }
  | { reason: 'reauth_required'; provider?: 'google' | 'apple' }
  | { reason: 'wrong_provider'; provider?: 'google' | 'apple' }
  | { reason: 'reauth_mismatch' }
  | { reason: 'reauth_expired' }
  | { reason: 'reauth_unavailable'; provider?: 'google' | 'apple' }
  | { reason: 'same_password' }
  | { reason: 'weak_password' }
  | { reason: 'invalid'; attemptsLeft?: number }
  | { reason: 'expired' }
  | { reason: 'locked' }
  | { reason: 'no_code' }
  | { reason: 'not_configured' }
  | { reason: 'send_failed' }
  | { reason: 'unknown' };

export type SecurityResult<T> = ({ ok: true } & T) | ({ ok: false } & SecurityProblem);

function problem(b: Body | null): { ok: false } & SecurityProblem {
  const e = b?.error;
  switch (e) {
    case 'password_required':
    case 'too_many_attempts':
    case 'email_taken':
    case 'same_email':
    case 'invalid_email':
    case 'reauth_mismatch':
    case 'reauth_expired':
    case 'same_password':
    case 'weak_password':
    case 'expired':
    case 'locked':
    case 'no_code':
    case 'send_failed':
      return { ok: false, reason: e };
    case 'email_not_configured':
      return { ok: false, reason: 'not_configured' };
    case 'wrong_password':
    case 'invalid':
      return { ok: false, reason: e, attemptsLeft: num(b?.attempts_left) };
    case 'too_many':
      return { ok: false, reason: 'too_many', retryAfter: num(b?.retry_after) };
    case 'read_only':
    case 'reauth_required':
    case 'wrong_provider':
    case 'reauth_unavailable':
      return { ok: false, reason: e, provider: provider(b?.provider) };
    default:
      return { ok: false, reason: 'unknown' };
  }
}

/**
 * Change email, step 1: the server checks the current password (or, for an Apple relay address
 * without a password, a fresh Sign in with Apple), refuses an address another account uses, then
 * emails a code ONLY to the new address. Nothing changes yet.
 */
export async function requestEmailChange(input: {
  newEmail: string;
  currentPassword?: string;
  reauth?: ReauthProof;
}): Promise<SecurityResult<{ email: string }>> {
  const b = await invoke('change-email', {
    action: 'request',
    new_email: input.newEmail,
    ...(input.currentPassword !== undefined
      ? { current_password: input.currentPassword }
      : {}),
    ...(input.reauth ? { reauth: input.reauth } : {}),
  });
  if (b?.status === 'sent') {
    return { ok: true, email: typeof b.email === 'string' ? b.email : input.newEmail };
  }
  return problem(b);
}

/** Change email, step 2: the code from the new inbox. The change takes effect now. */
export async function confirmEmailChange(
  newEmail: string,
  code: string,
): Promise<SecurityResult<{ email: string }>> {
  const b = await invoke('change-email', {
    action: 'confirm',
    new_email: newEmail,
    code,
  });
  if (b?.status === 'changed') {
    return { ok: true, email: typeof b.email === 'string' ? b.email : newEmail };
  }
  return problem(b);
}

/**
 * Change the password (the current one required) or set a first one (after re-authenticating with
 * the account's provider). The server then signs out every session of the account: the reply's
 * email lets the app sign THIS device in again (see signInAgain).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<SecurityResult<{ email: string }>> {
  const b = await invoke('update-password', {
    action: 'change',
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (b?.status === 'changed' && typeof b.email === 'string')
    return { ok: true, email: b.email };
  return problem(b);
}

export async function setPassword(
  newPassword: string,
  reauth: ReauthProof,
): Promise<SecurityResult<{ email: string }>> {
  const b = await invoke('update-password', {
    action: 'set',
    new_password: newPassword,
    reauth,
  });
  if (b?.status === 'set' && typeof b.email === 'string')
    return { ok: true, email: b.email };
  return problem(b);
}

/** Sign this device in again after a password change signed every session out. */
export async function signInAgain(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

/** Pick up a changed email on this device's session (the new address shows everywhere). */
export async function refreshAccount(): Promise<void> {
  await supabase.auth.refreshSession();
}
