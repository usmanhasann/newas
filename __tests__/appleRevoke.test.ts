/**
 * Sign in with Apple revocation on Delete Account (App Store rule), per Apple's REST API docs:
 * the client_secret JWT (ES256, header kid, claims iss/iat/exp/aud/sub, exp <= 6 months), the code
 * exchange at /auth/token (no redirect_uri for the native flow) and the revoke at /auth/revoke.
 * Runs the same source as the delete-account Edge Function (supabase/functions/_shared).
 */
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleClientSecret,
  appleRevokeConfig,
  appleSubjectOf,
  idTokenSubject,
  revokeAppleForDeletion,
  type AppleRevokeConfig,
} from '../supabase/functions/_shared/appleRevoke';

const subtle = globalThis.crypto.subtle;
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const b64url = (s: string) =>
  toB64(new TextEncoder().encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const fakeIdToken = (sub: string) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify({ sub, iss: 'https://appleid.apple.com' }))}.sig`;

let config: AppleRevokeConfig;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const der = toB64(new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
  config = { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'com.lysm.app', privateKey: pem };
});

type Call = { url: string; body: URLSearchParams; headers: Record<string, string> };
function mockFetch(responses: { ok: boolean; status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, body: new URLSearchParams(init.body), headers: init.headers });
    const r = responses.shift() ?? { ok: false, status: 500 };
    return { ok: r.ok, status: r.status, json: async () => r.body ?? {} };
  });
  return { fetchImpl, calls };
}

describe('client_secret JWT', () => {
  it('is a valid ES256 JWT with Apple’s header and claims, signed by the key', async () => {
    const jwt = await appleClientSecret(config, 1_800_000_000);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(text(fromB64url(h)))).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const claims = JSON.parse(text(fromB64url(p)));
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      aud: 'https://appleid.apple.com',
      sub: 'com.lysm.app',
    });
    expect(claims.exp).toBeGreaterThan(claims.iat);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15_777_000); // Apple's six-month limit
    const valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromB64url(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(fromB64url(s)).toHaveLength(64); // raw r||s, as JWS ES256 requires
    expect(valid).toBe(true);
  });

  it('accepts a key whose line breaks were stored as "\\n" text', async () => {
    const flat = { ...config, privateKey: config.privateKey.replace(/\n/g, '\\n') };
    await expect(appleClientSecret(flat, 1_800_000_000)).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe('revokeAppleForDeletion', () => {
  const base = { nowSeconds: 1_800_000_000, expectedSub: 'apple-sub-1', code: 'code-1' };

  it('exchanges the code (no redirect_uri), checks the Apple ID, then revokes the refresh token', async () => {
    const { fetchImpl, calls } = mockFetch([
      { ok: true, status: 200, body: { access_token: 'at', refresh_token: 'rt', id_token: fakeIdToken('apple-sub-1') } },
      { ok: true, status: 200 },
    ]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl })).resolves.toEqual({ outcome: 'revoked' });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(APPLE_TOKEN_URL);
    expect(calls[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(calls[0].body)).toEqual({
      client_id: 'com.lysm.app',
      client_secret: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      code: 'code-1',
      grant_type: 'authorization_code',
    });
    expect(calls[1].url).toBe(APPLE_REVOKE_URL);
    expect(Object.fromEntries(calls[1].body)).toEqual({
      client_id: 'com.lysm.app',
      client_secret: expect.any(String),
      token: 'rt',
      token_type_hint: 'refresh_token',
    });
  });

  it('a different Apple ID than the account’s is never revoked', async () => {
    const { fetchImpl, calls } = mockFetch([
      { ok: true, status: 200, body: { refresh_token: 'rt', id_token: fakeIdToken('someone-else') } },
    ]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl })).resolves.toEqual({ outcome: 'mismatch' });
    expect(calls).toHaveLength(1); // no revoke call
  });

  it('falls back to the access token when Apple returns no refresh token', async () => {
    const { fetchImpl, calls } = mockFetch([
      { ok: true, status: 200, body: { access_token: 'at', id_token: fakeIdToken('apple-sub-1') } },
      { ok: true, status: 200 },
    ]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl })).resolves.toEqual({ outcome: 'revoked' });
    expect(Object.fromEntries(calls[1].body)).toMatchObject({ token: 'at', token_type_hint: 'access_token' });
  });

  it('nothing to do, or nothing it can do, without calling Apple', async () => {
    const { fetchImpl } = mockFetch([]);
    await expect(revokeAppleForDeletion({ ...base, expectedSub: null, config, fetchImpl })).resolves.toEqual({ outcome: 'not_apple' });
    await expect(revokeAppleForDeletion({ ...base, config: null, fetchImpl })).resolves.toEqual({ outcome: 'not_configured' });
    await expect(revokeAppleForDeletion({ ...base, code: null, config, fetchImpl })).resolves.toEqual({ outcome: 'no_code' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Review finding: every failure must say which step failed and Apple's error code (never a
  // secret), so a broken key setup can be told apart from a one-off network blip.
  it('Apple errors come back as "failed" with a log-safe reason, never as a throw', async () => {
    const rejected = mockFetch([{ ok: false, status: 400, body: { error: 'invalid_grant' } }]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl: rejected.fetchImpl })).resolves.toEqual({
      outcome: 'failed',
      reason: 'token invalid_grant',
    });
    expect(rejected.calls).toHaveLength(1);

    const revokeFails = mockFetch([
      { ok: true, status: 200, body: { refresh_token: 'rt', id_token: fakeIdToken('apple-sub-1') } },
      { ok: false, status: 400, body: { error: 'invalid_client' } },
    ]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl: revokeFails.fetchImpl })).resolves.toEqual({
      outcome: 'failed',
      reason: 'revoke invalid_client',
    });

    const noBody = mockFetch([{ ok: false, status: 503 }]);
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl: noBody.fetchImpl })).resolves.toEqual({
      outcome: 'failed',
      reason: 'token http_503',
    });

    const down = jest.fn(async () => {
      throw new TypeError('network');
    });
    await expect(revokeAppleForDeletion({ ...base, config, fetchImpl: down })).resolves.toEqual({
      outcome: 'failed',
      reason: 'token TypeError',
    });

    const badKey = mockFetch([]);
    const keyResult = await revokeAppleForDeletion({
      ...base,
      config: { ...config, privateKey: 'not a key' },
      fetchImpl: badKey.fetchImpl,
    });
    expect(keyResult.outcome).toBe('failed');
    expect(keyResult.reason).toMatch(/^key [A-Za-z]+$/);
    expect(badKey.fetchImpl).not.toHaveBeenCalled();
  });

  // Review finding: a hanging Apple endpoint must not stall the deletion.
  it('gives up on an Apple request that hangs, as "failed" (the deletion then goes ahead)', async () => {
    const hanging = jest.fn(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    await expect(
      revokeAppleForDeletion({ ...base, config, fetchImpl: hanging, timeoutMs: 50 }),
    ).resolves.toEqual({ outcome: 'failed', reason: 'token TimeoutError' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('helpers', () => {
  it('reads the config from the environment, defaulting the client id to the bundle id', () => {
    const env = (vals: Record<string, string>) => (k: string) => vals[k];
    expect(appleRevokeConfig(env({}))).toBeNull();
    expect(appleRevokeConfig(env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' }))).toBeNull();
    expect(appleRevokeConfig(env({ APPLE_TEAM_ID: ' T ', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'P' }))).toEqual({
      teamId: 'T',
      keyId: 'K',
      privateKey: 'P',
      clientId: 'com.lysm.app',
    });
  });

  it('finds the account’s Apple user id', () => {
    expect(appleSubjectOf([{ provider: 'email', id: 'x' }, { provider: 'apple', id: 'id-1', identity_data: { sub: 'sub-1' } }])).toBe('sub-1');
    expect(appleSubjectOf([{ provider: 'apple', id: 'id-1', identity_data: {} }])).toBe('id-1');
    expect(appleSubjectOf([{ provider: 'google', id: 'g' }])).toBeNull();
    expect(appleSubjectOf(null)).toBeNull();
  });

  it('reads the subject of an id_token, or null for anything else', () => {
    expect(idTokenSubject(fakeIdToken('abc'))).toBe('abc');
    expect(idTokenSubject('garbage')).toBeNull();
    expect(idTokenSubject(undefined)).toBeNull();
  });
});
