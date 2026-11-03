/**
 * Server-side Apple / Google identity token check (supabase/functions/_shared/providerToken.ts),
 * used by "Set a password" and the Apple relay email change (N5, client revisions 10/14 p.20-21):
 * a real RS256 signature against the provider's published keys, issuer, audience, expiry and a
 * fresh sign-in. Real keys are generated here, so the same verification code runs as on the server.
 */
import {
  APPLE_KEYS,
  audiencesFrom,
  clearProviderKeyCache,
  decodeJwtPayload,
  isFreshOAuthSignIn,
  verifyIdToken,
} from '../supabase/functions/_shared/providerToken';

const subtle = globalThis.crypto.subtle;
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function keyPair() {
  return (await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

async function sign(
  pair: CryptoKeyPair,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const h = enc(header);
  const p = enc(payload);
  const sig = new Uint8Array(
    await subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(`${h}.${p}`),
    ),
  );
  return `${h}.${p}.${b64url(sig)}`;
}

const NOW = 1_800_000_000;

describe('verifyIdToken (RS256 against the provider keys)', () => {
  let pair: CryptoKeyPair;
  let other: CryptoKeyPair;
  let jwks: { keys: unknown[] };
  const fetches: string[] = [];
  const fetchImpl = async (url: string) => {
    fetches.push(url);
    return { ok: true, json: async () => jwks };
  };
  const claims = (over: Record<string, unknown> = {}) => ({
    iss: 'https://appleid.apple.com',
    aud: 'com.lysm.app',
    sub: 'apple-user-1',
    iat: NOW - 30,
    exp: NOW + 600,
    ...over,
  });
  const opts = (over: Record<string, unknown> = {}) => ({
    ...APPLE_KEYS,
    audiences: ['com.lysm.app'],
    nowSeconds: NOW,
    maxAgeSeconds: 600,
    fetchImpl,
    ...over,
  });

  beforeAll(async () => {
    pair = await keyPair();
    other = await keyPair();
    const jwk = await subtle.exportKey('jwk', pair.publicKey);
    jwks = {
      keys: [{ kty: 'RSA', kid: 'k1', n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }],
    };
  });
  beforeEach(() => {
    clearProviderKeyCache();
    fetches.length = 0;
  });

  it('accepts a valid, fresh token for our app and returns its claims', async () => {
    const t = await sign(pair, { alg: 'RS256', kid: 'k1' }, claims());
    expect((await verifyIdToken(t, opts()))?.sub).toBe('apple-user-1');
    expect(fetches).toEqual(['https://appleid.apple.com/auth/keys']);
    // The keys are cached.
    await verifyIdToken(t, opts());
    expect(fetches).toHaveLength(1);
  });

  it('accepts an audience list (Google style)', async () => {
    const t = await sign(
      pair,
      { alg: 'RS256', kid: 'k1' },
      claims({ aud: ['x', 'com.lysm.app'] }),
    );
    expect(await verifyIdToken(t, opts())).not.toBeNull();
  });

  it.each([
    ['another app', { aud: 'com.other.app' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { exp: NOW - 120 }],
    [
      'an old sign-in (not a fresh re-authentication)',
      { iat: NOW - 601, exp: NOW + 600 },
    ],
    ['a token from the future', { iat: NOW + 300 }],
    ['no subject', { sub: '' }],
  ])('refuses %s', async (_name, over) => {
    const t = await sign(pair, { alg: 'RS256', kid: 'k1' }, claims(over));
    expect(await verifyIdToken(t, opts())).toBeNull();
  });

  it('refuses a token signed by another key, an unsigned token and garbage', async () => {
    expect(
      await verifyIdToken(
        await sign(other, { alg: 'RS256', kid: 'k1' }, claims()),
        opts(),
      ),
    ).toBeNull();
    const [h, p] = (await sign(pair, { alg: 'RS256', kid: 'k1' }, claims())).split('.');
    expect(
      await verifyIdToken(`${enc({ alg: 'none', kid: 'k1' })}.${p}.`, opts()),
    ).toBeNull();
    expect(await verifyIdToken(`${h}.${p}.`, opts())).toBeNull();
    expect(await verifyIdToken('not.a.token', opts())).toBeNull();
    expect(await verifyIdToken('', opts())).toBeNull();
  });

  it('refetches the keys once when the key id is new (rotation), and refuses unknown keys', async () => {
    const t = await sign(pair, { alg: 'RS256', kid: 'k1' }, claims());
    const saved = jwks;
    jwks = { keys: [] };
    expect(await verifyIdToken(t, opts())).toBeNull(); // unknown: fetched, refetched, still unknown
    expect(fetches).toHaveLength(2);
    jwks = saved;
    expect(await verifyIdToken(t, opts())).not.toBeNull(); // rotated in: found on the refetch
  });
});

describe('isFreshOAuthSignIn (browser Google fallback)', () => {
  it('needs an oauth sign-in within the window', () => {
    expect(
      isFreshOAuthSignIn({ amr: [{ method: 'oauth', timestamp: NOW - 30 }] }, NOW, 600),
    ).toBe(true);
    expect(
      isFreshOAuthSignIn({ amr: [{ method: 'oauth', timestamp: NOW - 601 }] }, NOW, 600),
    ).toBe(false);
    expect(
      isFreshOAuthSignIn({ amr: [{ method: 'password', timestamp: NOW }] }, NOW, 600),
    ).toBe(false);
    expect(isFreshOAuthSignIn({}, NOW, 600)).toBe(false);
    expect(isFreshOAuthSignIn(null, NOW, 600)).toBe(false);
  });
});

describe('small helpers', () => {
  it('reads the payload and the audience setting', () => {
    expect(
      decodeJwtPayload(`${enc({ alg: 'x' })}.${enc({ session_id: 's1' })}.sig`),
    ).toEqual({ session_id: 's1' });
    expect(decodeJwtPayload('nope')).toBeNull();
    expect(audiencesFrom(' a.apps.googleusercontent.com , ,b ')).toEqual([
      'a.apps.googleusercontent.com',
      'b',
    ]);
    expect(audiencesFrom(undefined)).toEqual([]);
  });
});
