// Real dependencies for the Sign-in & Security handlers (accountSecurity.ts): database calls through
// the service role (the private auth_* functions of migration 20261022100000), the auth server, and
// email through Resend. Deno only (the handlers themselves are tested in Jest with fakes).
// Never logs a code, a password, a token or an email address.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  REAUTH_MAX_AGE_SECONDS,
  claimFlag,
  normalizeEmail,
  secureCode,
  secureToken,
  type Account,
  type Caller,
  type Identity,
  type CheckResult,
  type IssueResult,
  type LinkDeps,
  type SecurityDeps,
  type SocialProvider,
} from './accountSecurity.ts';
import {
  APPLE_KEYS,
  GOOGLE_KEYS,
  audiencesFrom,
  decodeJwtPayload,
  isFreshOAuthSignIn,
  verifyIdToken,
} from './providerToken.ts';

// eslint-disable-next-line no-undef
const env = (k: string): string | undefined => Deno.env.get(k);

function config() {
  return {
    url: env('SUPABASE_URL')!,
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY')!,
    anonKey: env('SUPABASE_ANON_KEY')!,
  };
}

function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** The signed-in user making the request, or null (anon key only, or an invalid token). */
export async function callerFrom(req: Request): Promise<Caller | null> {
  const { url, anonKey } = config();
  const token = bearer(req);
  if (!token || token === anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, isAnonymous: !!data.user.is_anonymous };
}

/** The client's IP from the platform's forwarding header (hashed before it is stored). */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first || null;
}

/**
 * The client ids whose id tokens we accept. Apple: the app's bundle id. Google: the OAuth client ids
 * the native sign-in uses (the Web client id is the audience of native Google id tokens); not set
 * until native Google is.
 */
function providerAudiences(provider: SocialProvider): string[] {
  return provider === 'apple'
    ? audiencesFrom(env('APPLE_CLIENT_ID') ?? 'com.lysm.app')
    : audiencesFrom(env('GOOGLE_OAUTH_CLIENT_IDS'));
}

/** The auth_account / auth_account_by_email JSON (null when there is no such account). */
function asAccount(value: unknown): Account | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!v.id) return null;
  return {
    id: String(v.id),
    email: typeof v.email === 'string' ? v.email : null,
    is_anonymous: !!v.is_anonymous,
    has_password: !!v.has_password,
    identities: Array.isArray(v.identities) ? (v.identities as Identity[]) : [],
  };
}

async function sendWithResend(m: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const key = env('RESEND_API_KEY');
  if (!key) return 'not_configured' as const;
  const from = env('RESEND_FROM') ?? 'LYSM <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
      }),
    });
    if (!res.ok) {
      console.warn('security email not sent: resend status ' + res.status);
      return 'failed' as const;
    }
    return 'sent' as const;
  } catch {
    console.warn('security email not sent: resend unreachable');
    return 'failed' as const;
  }
}

export function makeSecurityDeps(): SecurityDeps {
  const { url, serviceKey, anonKey } = config();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn} failed: ${error.code ?? ''}`);
    return data as T;
  }

  return {
    hmacKey: serviceKey,
    randomCode: secureCode,
    randomToken: secureToken,
    account: async (userId) => asAccount(await rpc('auth_account', { p_user: userId })),
    accountByEmail: async (email) =>
      asAccount(await rpc('auth_account_by_email', { p_email: email })),
    verification: async (userId) => {
      const { data, error } = await admin
        .from('email_verifications')
        .select('verified, verified_email')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('email_verifications read failed');
      return data
        ? { verified: !!data.verified, email: data.verified_email ?? null }
        : null;
    },
    issueCode: (a) =>
      rpc<IssueResult>('auth_code_issue', {
        p_user: a.userId,
        p_purpose: a.purpose,
        p_email: a.email,
        p_code_hash: a.codeHash,
        p_ttl_seconds: a.ttlSeconds,
        p_cooldown_seconds: a.cooldownSeconds,
        p_max_per_hour: a.maxPerHour,
        p_only_if_none: a.onlyIfNone,
      }),
    checkCode: (userId, purpose, codeHash) =>
      rpc<CheckResult>('auth_code_check', {
        p_user: userId,
        p_purpose: purpose,
        p_code_hash: codeHash,
      }),
    voidCode: async (userId, purpose) => {
      await rpc('auth_code_void', { p_user: userId, p_purpose: purpose });
    },
    issueTicket: (userId, ticketHash, ttlSeconds) =>
      rpc<boolean>('auth_reset_ticket_issue', {
        p_user: userId,
        p_ticket_hash: ticketHash,
        p_ttl_seconds: ttlSeconds,
      }),
    useTicket: (userId, ticketHash) =>
      rpc<boolean>('auth_reset_ticket_use', {
        p_user: userId,
        p_ticket_hash: ticketHash,
      }),
    rateHit: (key, windowSeconds, max) =>
      rpc<boolean>('auth_rate_hit', {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_max: max,
      }),
    rateCount: (key, windowSeconds) =>
      rpc<number>('auth_rate_count', { p_key: key, p_window_seconds: windowSeconds }),
    rateAdd: async (key) => {
      await rpc('auth_rate_add', { p_key: key });
    },
    rateClear: async (key) => {
      await rpc('auth_rate_clear', { p_key: key });
    },
    verifyPassword: (userId, password) =>
      rpc<boolean>('auth_verify_password', { p_user: userId, p_password: password }),
    updatePasswordAsAdmin: async (userId, password) => {
      // The auth server signs out every session of the user on an admin password update.
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error)
        console.warn(
          'admin password update failed: ' + (error.code ?? error.status ?? ''),
        );
      return !error;
    },
    updateEmail: async (userId, email) => {
      // Confirmed by our own code already, so set it directly (no Supabase confirmation links).
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (!error) return 'ok';
      if (
        error.code === 'email_exists' ||
        /already been registered|duplicate key|unique/i.test(error.message)
      ) {
        return 'taken';
      }
      console.warn('email update failed: ' + (error.code ?? error.status ?? ''));
      return 'failed';
    },
    markVerified: (userId, email) =>
      rpc<boolean>('auth_mark_email_verified', { p_user: userId, p_email: email }),
    revokeSessions: async (userId, keepSessionId) => {
      await rpc('auth_revoke_sessions', { p_user: userId, p_keep: keepSessionId });
    },
    endSession: async (userId, sessionId) => {
      await rpc('auth_end_session', { p_user: userId, p_session: sessionId });
    },
    sendEmail: sendWithResend,
    verifyIdToken: async (provider, idToken) => {
      const keys = provider === 'apple' ? APPLE_KEYS : GOOGLE_KEYS;
      const audiences = providerAudiences(provider);
      if (audiences.length === 0) return 'not_configured';
      const nowSeconds = Math.floor(Date.now() / 1000);
      const claims = await verifyIdToken(idToken, {
        ...keys,
        audiences,
        nowSeconds,
        fetchImpl: (u) => fetch(u),
      });
      if (!claims) return null;
      // A re-authentication must be recent; an older (valid) token gets 'reauth_expired'.
      return {
        sub: String(claims.sub),
        fresh: nowSeconds - Number(claims.iat) <= REAUTH_MAX_AGE_SECONDS,
      };
    },
    oauthSession: async (accessToken) => {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      const payload = decodeJwtPayload(accessToken);
      return {
        userId: data.user.id,
        sessionId: typeof payload?.session_id === 'string' ? payload.session_id : null,
        fresh: isFreshOAuthSignIn(
          payload,
          Math.floor(Date.now() / 1000),
          REAUTH_MAX_AGE_SECONDS,
        ),
      };
    },
  };
}

/**
 * The account linking pre-check's dependencies (account-link, N4): the Sign-in & Security ones plus
 * who owns a Google / Apple identity (migration 20261022110000) and a provider token's claims.
 */
export function makeLinkDeps(): LinkDeps {
  const base = makeSecurityDeps();
  const { url, serviceKey } = config();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    ...base,
    now: () => Date.now(),
    identityOwner: async (provider, sub) => {
      const { data, error } = await admin.rpc('auth_identity_owner', {
        p_provider: provider,
        p_provider_id: sub,
      });
      if (error) throw new Error(`auth_identity_owner failed: ${error.code ?? ''}`);
      return typeof data === 'string' && data ? data : null;
    },
    providerClaims: async (provider, idToken) => {
      const audiences = providerAudiences(provider);
      if (audiences.length === 0) return 'not_configured';
      const claims = await verifyIdToken(idToken, {
        ...(provider === 'apple' ? APPLE_KEYS : GOOGLE_KEYS),
        audiences,
        nowSeconds: Math.floor(Date.now() / 1000),
        fetchImpl: (u) => fetch(u),
      });
      if (!claims) return null;
      return {
        sub: String(claims.sub),
        email: typeof claims.email === 'string' ? normalizeEmail(claims.email) : null,
        emailVerified: claimFlag(claims.email_verified),
        privateEmail: claimFlag(claims.is_private_email),
      };
    },
  };
}
