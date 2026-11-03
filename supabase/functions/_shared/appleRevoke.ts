// Sign in with Apple token revocation for account deletion (App Store requirement: an app that
// offers Sign in with Apple must revoke the user's Apple authorization when they delete their
// account). Approach decided 2026-10-16: the app asks the user to confirm with Apple once on the
// Delete Account screen and sends Apple's one-time authorization code; here it is exchanged for the
// user's tokens and the refresh token is revoked. No Apple token is ever stored.
//
// IMPORT-FREE on purpose (like moderation.ts): only web-standard globals (fetch, crypto.subtle,
// atob/btoa, TextEncoder), so the Deno Edge Function and the Jest tests run the SAME source.
//
// Apple REST API (developer.apple.com, verified 2026-10-16):
//  - POST https://appleid.apple.com/auth/token  (form) client_id, client_secret, code,
//    grant_type=authorization_code; redirect_uri only if the authorization request had one (the
//    native iOS sheet has none). The code is single-use and valid for five minutes. Returns
//    { access_token, token_type, expires_in, refresh_token, id_token }.
//  - POST https://appleid.apple.com/auth/revoke (form) client_id, client_secret, token,
//    token_type_hint (refresh_token | access_token). 200 with no body on success, also when the
//    token was already invalid; 400 { error } otherwise.
//  - client_secret: a JWT signed ES256 (ECDSA P-256 + SHA-256) with the Sign in with Apple key.
//    Header { alg: 'ES256', kid: <Key ID> }; claims { iss: <Team ID>, iat, exp (at most 15777000 s
//    = six months after iat), aud: 'https://appleid.apple.com', sub: <client_id> }.
//  - client_id for the native iOS flow is the App ID (bundle id), here com.lysm.app.

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** Our secrets are made per request, so a short life is plenty (Apple allows up to six months). */
const CLIENT_SECRET_TTL_S = 5 * 60;

export interface AppleRevokeConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  /** The .p8 key file's text (PKCS#8 PEM). Literal "\n" sequences are accepted too. */
  privateKey: string;
}

/** How long each Apple request may take before it counts as failed (deletion then goes ahead). */
export const APPLE_TIMEOUT_MS = 8000;

export type AppleRevokeOutcome =
  | 'revoked' // Apple confirmed the authorization is revoked
  | 'not_apple' // the account has no Apple sign-in: nothing to do
  | 'not_configured' // the Apple key isn't set up on the server yet
  | 'no_code' // Apple account, but the app sent no code (no Apple ID on the phone, Android, old builds)
  | 'mismatch' // confirmed with a different Apple ID than the account's (that Apple ID is left alone)
  | 'failed'; // Apple rejected the code/token, couldn't be reached, or the key is broken

export interface AppleRevokeResult {
  outcome: AppleRevokeOutcome;
  /** For the server log only, never secrets: the step that failed + Apple's error code / error name. */
  reason?: string;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Reads the config from environment values; null when anything is missing. */
export function appleRevokeConfig(get: (k: string) => string | undefined): AppleRevokeConfig | null {
  const teamId = get('APPLE_TEAM_ID')?.trim();
  const keyId = get('APPLE_KEY_ID')?.trim();
  const privateKey = get('APPLE_PRIVATE_KEY')?.trim();
  const clientId = (get('APPLE_CLIENT_ID') ?? 'com.lysm.app').trim();
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  return { teamId, keyId, clientId, privateKey };
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(text: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(text));
}

function bytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The DER bytes inside a PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----"). */
function pkcs8Der(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('apple_key_invalid');
  return bytesFromBase64(body);
}

/** The ES256 client_secret JWT Apple requires on /auth/token and /auth/revoke. */
export async function appleClientSecret(config: AppleRevokeConfig, nowSeconds: number): Promise<string> {
  const header = { alg: 'ES256', kid: config.keyId };
  const claims = {
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + CLIENT_SECRET_TTL_S,
    aud: APPLE_AUDIENCE,
    sub: config.clientId,
  };
  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der(config.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto returns the raw r||s (64 bytes) signature, which is exactly JWS ES256's format.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

/** The `sub` (Apple user id) inside an id_token received directly from Apple, or null. */
export function idTokenSubject(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((payload.length + 3) % 4));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/** Apple's error code from a 400 body ("invalid_client", "invalid_grant", ...), or the HTTP status. */
async function appleErrorCode(res: { status: number; json: () => Promise<unknown> }): Promise<string> {
  try {
    const err = ((await res.json()) as { error?: unknown }).error;
    if (typeof err === 'string' && /^[a-z_]{1,40}$/.test(err)) return err;
  } catch {
    /* no JSON body */
  }
  return 'http_' + res.status;
}

/**
 * Revoke the deleting user's Sign in with Apple authorization. `expectedSub` is the Apple user id
 * on the account being deleted (its Apple identity); null when the account has none. Never throws
 * and never blocks the deletion: every problem comes back as an outcome (+ a log-safe reason), and
 * the caller deletes the account whatever the outcome (App Store 5.1.1(v): deletion must always be
 * possible). A different Apple ID than the account's is never revoked ('mismatch'). Each Apple
 * request gives up after `timeoutMs`.
 */
export async function revokeAppleForDeletion(opts: {
  config: AppleRevokeConfig | null;
  code: string | null;
  expectedSub: string | null;
  nowSeconds: number;
  fetchImpl: FetchLike;
  timeoutMs?: number;
}): Promise<AppleRevokeResult> {
  const { config, code, expectedSub, nowSeconds, fetchImpl, timeoutMs = APPLE_TIMEOUT_MS } = opts;
  if (!expectedSub) return { outcome: 'not_apple' };
  if (!config) return { outcome: 'not_configured' };
  if (!code) return { outcome: 'no_code' };
  let stage = 'key';
  try {
    const clientSecret = await appleClientSecret(config, nowSeconds);
    stage = 'token';
    const tokenRes = await fetchImpl(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({
        client_id: config.clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!tokenRes.ok) return { outcome: 'failed', reason: `token ${await appleErrorCode(tokenRes)}` };
    const tokens = (await tokenRes.json()) as {
      refresh_token?: unknown;
      access_token?: unknown;
      id_token?: unknown;
    };
    // Only ever revoke the Apple ID that belongs to this account.
    if (idTokenSubject(tokens.id_token) !== expectedSub) return { outcome: 'mismatch' };

    const refresh = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
    const access = typeof tokens.access_token === 'string' ? tokens.access_token : null;
    const token = refresh ?? access;
    if (!token) return { outcome: 'failed', reason: 'token no_token' };
    stage = 'revoke';
    const revokeRes = await fetchImpl(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({
        client_id: config.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: refresh ? 'refresh_token' : 'access_token',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (revokeRes.ok) return { outcome: 'revoked' };
    return { outcome: 'failed', reason: `revoke ${await appleErrorCode(revokeRes)}` };
  } catch (e) {
    // Only the error's NAME (e.g. TimeoutError, TypeError, DataError), never its message. Read
    // directly: a timeout's DOMException isn't always an `instanceof Error` across runtimes.
    const raw = (e as { name?: unknown } | null)?.name;
    const name = typeof raw === 'string' && /^[A-Za-z]{1,40}$/.test(raw) ? raw : 'error';
    return { outcome: 'failed', reason: `${stage} ${name}` };
  }
}

/** The Apple user id of the account's Apple identity (identity_data.sub, else the identity id). */
export function appleSubjectOf(
  identities: { provider?: string; id?: string; identity_data?: Record<string, unknown> | null }[] | null | undefined,
): string | null {
  const apple = identities?.find((i) => i.provider === 'apple');
  if (!apple) return null;
  const sub = apple.identity_data?.sub;
  if (typeof sub === 'string' && sub) return sub;
  return apple.id || null;
}
