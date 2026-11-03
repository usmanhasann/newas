/**
 * Account linking data access (client revisions 10/14 p.15-16 and p.19, N4): the account-link Edge
 * Function (the pre-check every Google / Apple token goes through BEFORE the auth server sees it,
 * and the "re-authenticate, then set a new password" steps), plus the separate auth client a link
 * signs in on, so the app's own session (the onboarding's anonymous one, or none) only changes once
 * the link is done. Replies are validated with Zod; the server checks everything again.
 * Nothing here ever logs a token, a password or an email address.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env, supabase } from '@lib';
import type { Database } from '@app-types/database';
import type { LinkMethod, SocialProviderId } from './linking';

/** The pre-check couldn't answer (too many tries, a bad token, the server, the network). */
export class LinkServiceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Account link check failed (${code})`);
    this.name = 'LinkServiceError';
    this.code = code;
  }
}

/** A Google / Apple sign-in proof: a native id token, or a browser Google sign-in's access token. */
export type LinkProof =
  | { provider: SocialProviderId; id_token: string }
  | { provider: 'google'; access_token: string };

type Invoked = { missing: true } | { missing: false; data: unknown };

/**
 * Call account-link. `missing` = the function isn't deployed yet (404): sign-in then works as it
 * did before linking existed. Any other failure throws.
 */
async function invoke(body: Record<string, unknown>): Promise<Invoked> {
  const { data, error } = await supabase.functions.invoke('account-link', { body });
  if (error) {
    const status = (error as { context?: { status?: unknown } }).context?.status;
    if (status === 404) return { missing: true };
    throw new LinkServiceError('link_unavailable');
  }
  return { missing: false, data };
}

const providerSchema = z.enum(['google', 'apple']);
const errorReply = z.object({ error: z.string(), retry_after: z.number().optional() });

const checkReply = z.union([
  z.object({ status: z.literal('existing') }),
  z.object({ status: z.literal('new'), relay: z.boolean() }),
  z.object({
    status: z.literal('link_required'),
    method: z.enum(['password', 'google', 'apple']),
    email: z.string().min(3),
  }),
  z.object({
    status: z.literal('email_unverified'),
    side: z.enum(['account', 'provider']),
  }),
  z.object({ status: z.literal('email_in_use') }),
  errorReply,
]);

export type ProviderCheck =
  | { status: 'existing' }
  | { status: 'new'; relay: boolean }
  | { status: 'link_required'; method: LinkMethod; email: string }
  | { status: 'email_unverified'; side: 'account' | 'provider' }
  | { status: 'email_in_use' }
  /** account-link isn't deployed yet: sign in as before. */
  | { status: 'unavailable' };

/** What a Google / Apple sign-in would do (asked before the auth server sees the token). */
export async function checkProviderToken(
  provider: SocialProviderId,
  idToken: string,
): Promise<ProviderCheck> {
  const res = await invoke({ action: 'check', provider, id_token: idToken });
  if (res.missing) return { status: 'unavailable' };
  const parsed = checkReply.safeParse(res.data);
  if (!parsed.success) throw new LinkServiceError('link_unavailable');
  const reply = parsed.data;
  if ('error' in reply) {
    throw new LinkServiceError(
      reply.error === 'too_many' ? 'link_too_many' : `link_${reply.error}`,
    );
  }
  if (reply.status === 'link_required') {
    return { ...reply, email: reply.email.trim().toLowerCase() };
  }
  return reply;
}

const emailReply = z.union([
  z.object({ status: z.literal('provider_only'), provider: providerSchema }),
  z.object({ status: z.literal('none') }),
  errorReply,
]);

export type EmailMethod =
  | { status: 'provider_only'; provider: SocialProviderId }
  | { status: 'none' }
  /** Not answered (not deployed, too many tries, offline): show what the app showed before. */
  | { status: 'unknown' };

/** After an email + password sign-in failed: is this a Google / Apple only account? (p.16) */
export async function emailSignInMethod(email: string): Promise<EmailMethod> {
  try {
    const res = await invoke({ action: 'email', email: email.trim() });
    if (res.missing) return { status: 'unknown' };
    const parsed = emailReply.safeParse(res.data);
    if (!parsed.success || 'error' in parsed.data) return { status: 'unknown' };
    return parsed.data;
  } catch {
    return { status: 'unknown' };
  }
}

export type LinkProblem =
  | 'reauth_mismatch'
  | 'reauth_expired'
  | 'wrong_provider'
  | 'reauth_unavailable'
  | 'too_many_attempts'
  | 'too_many'
  | 'invalid_ticket'
  | 'has_password'
  | 'weak_password'
  | 'unknown';

const KNOWN_PROBLEMS: readonly LinkProblem[] = [
  'reauth_mismatch',
  'reauth_expired',
  'wrong_provider',
  'reauth_unavailable',
  'too_many_attempts',
  'too_many',
  'invalid_ticket',
  'has_password',
  'weak_password',
];

function problemOf(data: unknown): LinkProblem {
  const parsed = errorReply.safeParse(data);
  const e = parsed.success ? parsed.data.error : '';
  return (KNOWN_PROBLEMS as readonly string[]).includes(e)
    ? (e as LinkProblem)
    : 'unknown';
}

const confirmReply = z.object({
  status: z.literal('confirmed'),
  ticket: z.string().optional(),
});

/**
 * The existing account's own provider proves it's them (p.15). `keepSession`: a browser Google
 * sign-in the app will link on (ended by the server when it's the wrong account).
 */
export async function confirmLink(
  email: string,
  proof: LinkProof,
  keepSession = false,
): Promise<{ ok: true; ticket?: string } | { ok: false; reason: LinkProblem }> {
  try {
    const res = await invoke({
      action: 'confirm',
      email,
      proof,
      ...(keepSession ? { keep_session: true } : {}),
    });
    if (res.missing) return { ok: false, reason: 'unknown' };
    const parsed = confirmReply.safeParse(res.data);
    if (parsed.success) return { ok: true, ticket: parsed.data.ticket };
    return { ok: false, reason: problemOf(res.data) };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

/** "Then set a new password" (p.16): only with the ticket a successful confirm gave. */
export async function setLinkPassword(
  email: string,
  ticket: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: LinkProblem }> {
  try {
    const res = await invoke({
      action: 'set_password',
      email,
      ticket,
      new_password: newPassword,
    });
    if (res.missing) return { ok: false, reason: 'unknown' };
    const parsed = z.object({ status: z.literal('set') }).safeParse(res.data);
    return parsed.success ? { ok: true } : { ok: false, reason: problemOf(res.data) };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * A separate auth client, in memory only and never refreshed by itself, for signing in to the
 * existing account and adding the new sign-in to it. Its session becomes the app's session only
 * when the link is done (adoptSession), and the client is then dropped.
 */
export function createLinkClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'lysm-account-link',
    },
  });
}

/** Make a session from the link client this app's session (the route gate then opens the account). */
export async function adoptSession(session: Session): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
}
