// Server-side check of a Sign in with Apple / Google identity token (RS256 JWT), used when a user
// proves who they are again with the provider their account was created with ("Set a password",
// client revisions 10/14 p.20, and an Apple relay address change, p.21). Also reusable by the
// account linking pre-check (N4).
//
// IMPORT-FREE on purpose (like appleRevoke.ts): only web-standard globals (fetch, crypto.subtle,
// atob, TextEncoder), so the Deno Edge Functions and the Jest tests run the SAME source.
//
// Checks: RS256 signature against the provider's published keys (JWKS, cached, refetched once when
// a key id is unknown), issuer, audience (our app's client ids), expiry, and that it was issued
// recently (a re-authentication must be fresh).

export interface ProviderKeys {
  jwksUrl: string;
  issuers: string[];
}

export const APPLE_KEYS: ProviderKeys = {
  jwksUrl: 'https://appleid.apple.com/auth/keys',
  issuers: ['https://appleid.apple.com'],
};

export const GOOGLE_KEYS: ProviderKeys = {
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
};

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

interface Jwk {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
}

export interface VerifyIdTokenOptions extends ProviderKeys {
  audiences: string[];
  nowSeconds: number;
  /** Refuse tokens issued longer ago than this (re-authentication must be fresh). */
  maxAgeSeconds?: number;
  fetchImpl: FetchLike;
}

const CLOCK_SKEW_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { keys: Jwk[]; at: number }>();

/** For tests: forget cached provider keys. */
export function clearProviderKeyCache(): void {
  jwksCache.clear();
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 =
    value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The payload of a JWT WITHOUT checking it (only for tokens already verified elsewhere). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  return parts.length === 3 ? decodePart(parts[1] ?? '') : null;
}

/** Comma-separated client ids from a setting, trimmed, empties dropped. */
export function audiencesFrom(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function providerJwks(
  url: string,
  fetchImpl: FetchLike,
  refresh: boolean,
): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (!refresh && cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  const res = await fetchImpl(url);
  if (!res.ok) return cached?.keys ?? [];
  const body = (await res.json()) as { keys?: unknown };
  const keys = Array.isArray(body?.keys) ? (body.keys as Jwk[]) : [];
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

/** The verified claims, or null when anything about the token is wrong. Never throws. */
export async function verifyIdToken(
  token: string,
  opts: VerifyIdTokenOptions,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h = '', p = '', s = ''] = parts;
    const header = decodePart(h);
    const payload = decodePart(p);
    if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string')
      return null;

    let keys = await providerJwks(opts.jwksUrl, opts.fetchImpl, false);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      keys = await providerJwks(opts.jwksUrl, opts.fetchImpl, true); // keys rotate
      jwk = keys.find((k) => k.kid === header.kid);
    }
    if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) return null;

    if (typeof payload.iss !== 'string' || !opts.issuers.includes(payload.iss))
      return null;
    const aud = payload.aud;
    const auds = Array.isArray(aud) ? aud : [aud];
    if (!auds.some((a) => typeof a === 'string' && opts.audiences.includes(a)))
      return null;
    const exp = Number(payload.exp);
    const iat = Number(payload.iat);
    if (!Number.isFinite(exp) || exp + CLOCK_SKEW_SECONDS < opts.nowSeconds) return null;
    if (!Number.isFinite(iat) || iat - CLOCK_SKEW_SECONDS > opts.nowSeconds) return null;
    if (opts.maxAgeSeconds !== undefined && opts.nowSeconds - iat > opts.maxAgeSeconds)
      return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Whether a Supabase access token (already verified by the auth server) comes from a Google
 * sign-in made in the last `maxAgeSeconds`: its `amr` lists an "oauth" sign-in that recent. Used
 * for the browser Google fallback, where the app has no Google id token.
 */
export function isFreshOAuthSignIn(
  payload: Record<string, unknown> | null,
  nowSeconds: number,
  maxAgeSeconds: number,
): boolean {
  const amr = payload?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    const e = entry as { method?: unknown; timestamp?: unknown } | null;
    const ts = Number(e?.timestamp);
    return (
      e?.method === 'oauth' &&
      Number.isFinite(ts) &&
      nowSeconds - ts <= maxAgeSeconds &&
      ts - CLOCK_SKEW_SECONDS <= nowSeconds
    );
  });
}
