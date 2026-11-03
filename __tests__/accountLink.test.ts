/**
 * Account linking pre-check (N4, client revisions 10/14 p.15-16 and p.19), run on the SAME source as
 * the account-link Edge Function (supabase/functions/_shared/accountSecurity.ts) with an in-memory
 * stand-in for the database, the auth server and the provider keys. auth_identity_owner (migration
 * 20261022110000) is checked against Postgres by supabase/tests/account_link_precheck.test.sql.
 */
import {
  LINK_CONFIRM_FAIL_MAX,
  LINK_IP_MAX,
  LINK_SUB_MAX,
  LINK_TICKET_TTL_SECONDS,
  accountLink,
  claimFlag,
  linkMethodFor,
  linkTicket,
  readLinkTicket,
  type Account,
  type LinkDeps,
  type ProviderClaims,
} from '../supabase/functions/_shared/accountSecurity';

const KEY = 'test-server-secret';

function world() {
  let now = 1_800_000_000_000;
  const accounts = new Map<string, Account>();
  const passwords = new Map<string, string>();
  const verifications = new Map<string, { verified: boolean; email: string | null }>();
  const rate = new Map<string, number[]>();
  const tokens = new Map<string, ProviderClaims & { provider: 'google' | 'apple' }>();
  const staleTokens = new Set<string>();
  const oauth = new Map<
    string,
    { userId: string; sessionId: string | null; fresh: boolean }
  >();
  const ended: string[] = [];
  const revoked: string[] = [];
  const state = { googleConfigured: true };
  const count = (key: string, windowS: number) =>
    (rate.get(key) ?? []).filter((t) => t > now - windowS * 1000).length;

  const deps: LinkDeps = {
    hmacKey: KEY,
    now: () => now,
    randomCode: () => '123456',
    randomToken: () => 'token',
    account: async (id) => accounts.get(id) ?? null,
    accountByEmail: async (email) =>
      [...accounts.values()].find(
        (a) => (a.email ?? '').toLowerCase() === email.trim().toLowerCase(),
      ) ?? null,
    verification: async (id) => verifications.get(id) ?? null,
    issueCode: async () => ({ status: 'issued' }),
    checkCode: async () => ({ status: 'missing' }),
    voidCode: async () => undefined,
    issueTicket: async () => false,
    useTicket: async () => false,
    rateHit: async (key, windowS, max) => {
      if (count(key, windowS) >= max) return false;
      rate.set(key, [...(rate.get(key) ?? []), now]);
      return true;
    },
    rateCount: async (key, windowS) => count(key, windowS),
    rateAdd: async (key) => {
      rate.set(key, [...(rate.get(key) ?? []), now]);
    },
    rateClear: async (key) => {
      rate.delete(key);
    },
    verifyPassword: async (userId, password) => passwords.get(userId) === password,
    updatePasswordAsAdmin: async (userId, password) => {
      passwords.set(userId, password);
      accounts.get(userId)!.has_password = true;
      return true;
    },
    updateEmail: async () => 'failed',
    markVerified: async (userId, email) => {
      if (accounts.get(userId)?.email !== email) return false;
      verifications.set(userId, { verified: true, email });
      return true;
    },
    revokeSessions: async (userId) => {
      revoked.push(userId);
    },
    endSession: async (userId, sessionId) => {
      ended.push(`${userId}:${sessionId}`);
    },
    sendEmail: async () => 'sent',
    verifyIdToken: async (provider, token) => {
      if (provider === 'google' && !state.googleConfigured) return 'not_configured';
      const t = tokens.get(token);
      if (!t || t.provider !== provider) return null;
      return { sub: t.sub, fresh: !staleTokens.has(token) };
    },
    oauthSession: async (accessToken) => oauth.get(accessToken) ?? null,
    identityOwner: async (provider, sub) =>
      [...accounts.values()].find((a) =>
        a.identities.some((i) => i.provider === provider && i.provider_id === sub),
      )?.id ?? null,
    providerClaims: async (provider, token) => {
      if (provider === 'google' && !state.googleConfigured) return 'not_configured';
      const t = tokens.get(token);
      if (!t || t.provider !== provider) return null;
      return {
        sub: t.sub,
        email: t.email,
        emailVerified: t.emailVerified,
        privateEmail: t.privateEmail,
      };
    },
  };

  const addAccount = (
    id: string,
    email: string,
    opts: {
      password?: string;
      providers?: ['google' | 'apple' | 'email', string][];
      verified?: boolean;
    },
  ) => {
    accounts.set(id, {
      id,
      email,
      is_anonymous: false,
      has_password: !!opts.password,
      identities: (opts.providers ?? []).map(([provider, provider_id], i) => ({
        provider,
        provider_id,
        created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      })),
    });
    if (opts.password) passwords.set(id, opts.password);
    if (opts.verified !== false) verifications.set(id, { verified: true, email });
  };
  const token = (
    name: string,
    provider: 'google' | 'apple',
    sub: string,
    email: string | null,
    extra: Partial<ProviderClaims> = {},
  ) => {
    tokens.set(name, {
      provider,
      sub,
      email,
      emailVerified: true,
      privateEmail: false,
      ...extra,
    });
    return name;
  };

  return {
    deps,
    accounts,
    passwords,
    verifications,
    state,
    ended,
    revoked,
    oauth,
    staleTokens,
    addAccount,
    token,
    tick: (ms: number) => {
      now += ms;
    },
    nowSeconds: () => Math.floor(now / 1000),
  };
}

const run = (
  w: ReturnType<typeof world>,
  body: unknown,
  ip: string | null = '203.0.113.9',
) => accountLink(w.deps, body, ip);

describe('check: what a Google / Apple sign-in would do, asked BEFORE the auth server sees it', () => {
  it('a sign-in already on an account is a plain sign-in, whichever linked method it is (p.16)', async () => {
    const w = world();
    w.addAccount('u1', 'sam@example.com', {
      password: 'Original 123',
      providers: [
        ['email', 'u1'],
        ['google', 'g-sam'],
        ['apple', 'a-sam'],
      ],
    });
    const g = w.token('tg', 'google', 'g-sam', 'sam@example.com');
    const a = w.token('ta', 'apple', 'a-sam', 'x9@privaterelay.appleid.com', {
      privateEmail: true,
    });
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: g })).body,
    ).toEqual({ status: 'existing' });
    expect(
      (await run(w, { action: 'check', provider: 'apple', id_token: a })).body,
    ).toEqual({ status: 'existing' });
  });

  it('email + password account, signing in with Google or Apple: verify with the original password (p.15-16)', async () => {
    const w = world();
    w.addAccount('u1', 'sam@example.com', {
      password: 'Original 123',
      providers: [['email', 'u1']],
    });
    for (const provider of ['google', 'apple'] as const) {
      const t = w.token(`t-${provider}`, provider, `${provider}-new`, 'Sam@Example.com');
      expect((await run(w, { action: 'check', provider, id_token: t })).body).toEqual({
        status: 'link_required',
        method: 'password',
        email: 'Sam@Example.com',
      });
    }
  });

  it('Google only account + Apple, Apple only account + Google: re-authenticate through the original provider (p.16)', async () => {
    const w = world();
    w.addAccount('ug', 'gina@example.com', { providers: [['google', 'g-gina']] });
    w.addAccount('ua', 'abe@example.com', { providers: [['apple', 'a-abe']] });
    const apple = w.token('t1', 'apple', 'a-new', 'gina@example.com');
    const google = w.token('t2', 'google', 'g-new', 'abe@example.com');
    expect(
      (await run(w, { action: 'check', provider: 'apple', id_token: apple })).body,
    ).toMatchObject({
      status: 'link_required',
      method: 'google',
    });
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: google })).body,
    ).toMatchObject({
      status: 'link_required',
      method: 'apple',
    });
  });

  it('the password wins when the account has one, else the OLDEST Google / Apple identity', () => {
    const base = { id: 'x', email: 'x@example.com', is_anonymous: false, identities: [] };
    expect(linkMethodFor({ ...base, has_password: true })).toBe('password');
    expect(
      linkMethodFor({
        ...base,
        has_password: false,
        identities: [
          { provider: 'apple', provider_id: 'a', created_at: '2026-01-01' },
          { provider: 'google', provider_id: 'g', created_at: '2026-02-01' },
        ],
      }),
    ).toBe('apple');
    expect(linkMethodFor({ ...base, has_password: false })).toBeNull();
  });

  it('only verified emails start email-match linking: the account’s and the provider’s (p.19)', async () => {
    const w = world();
    w.addAccount('u1', 'squat@example.com', {
      password: 'Theirs 123',
      providers: [['email', 'u1']],
      verified: false,
    });
    w.addAccount('u2', 'real@example.com', {
      password: 'Mine 1234',
      providers: [['email', 'u2']],
    });
    const onUnverifiedAccount = w.token('t1', 'google', 'g-1', 'squat@example.com');
    const unverifiedByProvider = w.token('t2', 'apple', 'a-2', 'real@example.com', {
      emailVerified: false,
    });
    expect(
      (
        await run(w, {
          action: 'check',
          provider: 'google',
          id_token: onUnverifiedAccount,
        })
      ).body,
    ).toEqual({
      status: 'email_unverified',
      side: 'account',
    });
    expect(
      (
        await run(w, {
          action: 'check',
          provider: 'apple',
          id_token: unverifiedByProvider,
        })
      ).body,
    ).toEqual({
      status: 'email_unverified',
      side: 'provider',
    });
    // A verification for an OLD address doesn't count for the current one.
    w.verifications.set('u2', { verified: true, email: 'old@example.com' });
    const t3 = w.token('t3', 'google', 'g-3', 'real@example.com');
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: t3 })).body,
    ).toEqual({
      status: 'email_unverified',
      side: 'account',
    });
  });

  it('no account matches: new, flagged when Apple hid the email so the app can ask "Already have a LYSM account?" (p.16)', async () => {
    const w = world();
    w.addAccount('u1', 'sam@example.com', { providers: [['google', 'g-sam']] });
    const plain = w.token('t1', 'google', 'g-other', 'someone@example.com');
    const relay = w.token('t2', 'apple', 'a-1', 'abc123@privaterelay.appleid.com', {
      privateEmail: true,
    });
    const noEmail = w.token('t3', 'apple', 'a-2', null);
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: plain })).body,
    ).toEqual({ status: 'new', relay: false });
    expect(
      (await run(w, { action: 'check', provider: 'apple', id_token: relay })).body,
    ).toEqual({ status: 'new', relay: true });
    expect(
      (await run(w, { action: 'check', provider: 'apple', id_token: noEmail })).body,
    ).toEqual({ status: 'new', relay: true });
  });

  it('an anonymous onboarding account is never a match', async () => {
    const w = world();
    w.addAccount('anon', 'sam@example.com', { providers: [] });
    w.accounts.get('anon')!.is_anonymous = true;
    const t = w.token('t', 'google', 'g-1', 'sam@example.com');
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: t })).body,
    ).toEqual({ status: 'new', relay: false });
  });

  it('refuses invalid tokens, says when Google is not set up, and validates the body', async () => {
    const w = world();
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: 'forged' })).body,
    ).toEqual({ error: 'invalid_token' });
    const t = w.token('t', 'apple', 'a-1', 'x@example.com');
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: t })).body,
    ).toEqual({ error: 'invalid_token' });
    w.state.googleConfigured = false;
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: 'x' })).body,
    ).toEqual({ error: 'not_configured' });
    expect(
      (await run(w, { action: 'check', provider: 'facebook', id_token: 'x' })).status,
    ).toBe(400);
    expect((await run(w, { action: 'merge' })).status).toBe(400);
    expect((await run(w, null)).status).toBe(400);
  });

  it('rate limits per IP and per provider account', async () => {
    const w = world();
    const t = w.token('t', 'google', 'g-1', 'x@example.com');
    for (let i = 0; i < LINK_SUB_MAX; i++) {
      expect(
        (
          await run(
            w,
            { action: 'check', provider: 'google', id_token: t },
            `198.51.100.${i}`,
          )
        ).body,
      ).toMatchObject({ status: 'new' });
    }
    expect(
      (await run(w, { action: 'check', provider: 'google', id_token: t }, '192.0.2.1'))
        .body,
    ).toMatchObject({ error: 'too_many' });
    const w2 = world();
    for (let i = 0; i < LINK_IP_MAX; i++)
      await run(w2, { action: 'email', email: `p${i}@example.com` });
    expect(
      (await run(w2, { action: 'email', email: 'last@example.com' })).body,
    ).toMatchObject({ error: 'too_many' });
  });
});

describe('email: an email + password sign-in on a Google / Apple only account (p.16)', () => {
  it('names the provider only for a Google / Apple only account; a password account and no account answer alike', async () => {
    const w = world();
    w.addAccount('ug', 'gina@example.com', { providers: [['google', 'g-gina']] });
    w.addAccount('ua', 'abe@example.com', {
      providers: [
        ['apple', 'a-abe'],
        ['google', 'g-abe'],
      ],
    });
    w.addAccount('up', 'pat@example.com', {
      password: 'Secret 123',
      providers: [
        ['email', 'up'],
        ['google', 'g-pat'],
      ],
    });
    expect((await run(w, { action: 'email', email: ' Gina@Example.com ' })).body).toEqual(
      { status: 'provider_only', provider: 'google' },
    );
    expect((await run(w, { action: 'email', email: 'abe@example.com' })).body).toEqual({
      status: 'provider_only',
      provider: 'apple',
    });
    expect((await run(w, { action: 'email', email: 'pat@example.com' })).body).toEqual({
      status: 'none',
    });
    expect((await run(w, { action: 'email', email: 'nobody@example.com' })).body).toEqual(
      { status: 'none' },
    );
    expect((await run(w, { action: 'email', email: 'not an email' })).body).toEqual({
      error: 'invalid_email',
    });
  });
});

describe('confirm + set_password: re-authenticate through the original provider, THEN set a new password (p.16)', () => {
  it('a fresh token of the account’s original identity confirms it and only then gives a ticket', async () => {
    const w = world();
    w.addAccount('ug', 'gina@example.com', { providers: [['google', 'g-gina']] });
    const proof = {
      provider: 'google',
      id_token: w.token('tg', 'google', 'g-gina', 'gina@example.com'),
    };
    const confirmed = await run(w, {
      action: 'confirm',
      email: 'gina@example.com',
      proof,
    });
    expect(confirmed.body).toMatchObject({ status: 'confirmed' });
    const ticket = String(confirmed.body.ticket);
    expect(await readLinkTicket(KEY, ticket, 'gina@example.com', w.nowSeconds())).toBe(
      'ug',
    );

    const set = await run(w, {
      action: 'set_password',
      email: 'gina@example.com',
      ticket,
      new_password: 'Brand new 1',
    });
    expect(set.body).toEqual({ status: 'set', email: 'gina@example.com' });
    expect(w.passwords.get('ug')).toBe('Brand new 1');
    expect(w.accounts.get('ug')!.identities).toEqual([
      expect.objectContaining({ provider: 'google', provider_id: 'g-gina' }),
    ]); // Google stays: a way in is added, none removed
    expect(w.verifications.get('ug')).toEqual({
      verified: true,
      email: 'gina@example.com',
    });
    expect(w.revoked).toEqual(['ug']);
  });

  it('never sets a password without the proof first, and never with a forged, stale or reused ticket', async () => {
    const w = world();
    w.addAccount('ua', 'abe@example.com', { providers: [['apple', 'a-abe']] });
    const body = (ticket: string) => ({
      action: 'set_password',
      email: 'abe@example.com',
      ticket,
      new_password: 'Brand new 1',
    });
    expect((await run(w, body(''))).status).toBe(400);
    const forged = await linkTicket(
      'another-key',
      'ua',
      'abe@example.com',
      w.nowSeconds() + 60,
    );
    expect((await run(w, body(forged))).body).toEqual({ error: 'invalid_ticket' });
    const otherEmail = await linkTicket(
      KEY,
      'ua',
      'eve@example.com',
      w.nowSeconds() + 60,
    );
    expect((await run(w, body(otherEmail))).body).toEqual({ error: 'invalid_ticket' });
    expect(w.passwords.has('ua')).toBe(false);

    const proof = {
      provider: 'apple',
      id_token: w.token('ta', 'apple', 'a-abe', 'abe@example.com'),
    };
    const ticket = String(
      (await run(w, { action: 'confirm', email: 'abe@example.com', proof })).body.ticket,
    );
    w.tick((LINK_TICKET_TTL_SECONDS + 1) * 1000);
    expect((await run(w, body(ticket))).body).toEqual({ error: 'invalid_ticket' });

    w.tick(-(LINK_TICKET_TTL_SECONDS + 1) * 1000);
    expect((await run(w, body(ticket))).body).toEqual({
      status: 'set',
      email: 'abe@example.com',
    });
    // Once set, the same ticket can't replace it (an existing password is never replaced).
    expect((await run(w, { ...body(ticket), new_password: 'Another 99' })).body).toEqual({
      error: 'has_password',
    });
    expect(w.passwords.get('ua')).toBe('Brand new 1');
  });

  it('refuses another account’s identity, the wrong provider, a stale token, and locks after repeated misses', async () => {
    const w = world();
    w.addAccount('ug', 'gina@example.com', { providers: [['google', 'g-gina']] });
    w.addAccount('ux', 'x@example.com', { providers: [['google', 'g-x']] });
    const other = {
      provider: 'google',
      id_token: w.token('tx', 'google', 'g-x', 'x@example.com'),
    };
    expect(
      (await run(w, { action: 'confirm', email: 'gina@example.com', proof: other })).body,
    ).toEqual({ error: 'reauth_mismatch' });
    const apple = {
      provider: 'apple',
      id_token: w.token('ta', 'apple', 'a-1', 'gina@example.com'),
    };
    expect(
      (await run(w, { action: 'confirm', email: 'gina@example.com', proof: apple })).body,
    ).toEqual({
      error: 'wrong_provider',
      provider: 'google',
    });
    const stale = w.token('ts', 'google', 'g-gina', 'gina@example.com');
    w.staleTokens.add(stale);
    expect(
      (
        await run(w, {
          action: 'confirm',
          email: 'gina@example.com',
          proof: { provider: 'google', id_token: stale },
        })
      ).body,
    ).toEqual({
      error: 'reauth_expired',
    });
    for (let i = 1; i < LINK_CONFIRM_FAIL_MAX; i++) {
      await run(w, { action: 'confirm', email: 'gina@example.com', proof: other });
    }
    const right = {
      provider: 'google',
      id_token: w.token('tr', 'google', 'g-gina', 'gina@example.com'),
    };
    expect(
      (await run(w, { action: 'confirm', email: 'gina@example.com', proof: right })).body,
    ).toEqual({
      error: 'too_many_attempts',
    });
  });

  it('a password account confirms without a ticket (it never gets a new password this way)', async () => {
    const w = world();
    w.addAccount('up', 'pat@example.com', {
      password: 'Secret 123',
      providers: [
        ['email', 'up'],
        ['google', 'g-pat'],
      ],
    });
    const proof = {
      provider: 'google',
      id_token: w.token('t', 'google', 'g-pat', 'pat@example.com'),
    };
    // The original provider of a password account is still its first Google / Apple identity.
    expect(
      (await run(w, { action: 'confirm', email: 'pat@example.com', proof })).body,
    ).toEqual({ status: 'confirmed' });
  });

  it('browser Google proof: ended after use, or kept (to link on it) only when it is this account', async () => {
    const w = world();
    w.addAccount('ug', 'gina@example.com', { providers: [['google', 'g-gina']] });
    w.oauth.set('at-gina', { userId: 'ug', sessionId: 's1', fresh: true });
    w.oauth.set('at-other', { userId: 'ux', sessionId: 's2', fresh: true });
    const proof = (t: string) => ({ provider: 'google', access_token: t });

    expect(
      (
        await run(w, {
          action: 'confirm',
          email: 'gina@example.com',
          proof: proof('at-gina'),
        })
      ).body,
    ).toMatchObject({ status: 'confirmed' });
    expect(w.ended).toEqual(['ug:s1']);

    expect(
      (
        await run(w, {
          action: 'confirm',
          email: 'gina@example.com',
          proof: proof('at-gina'),
          keep_session: true,
        })
      ).body,
    ).toMatchObject({ status: 'confirmed' });
    expect(w.ended).toEqual(['ug:s1']); // kept this time

    expect(
      (
        await run(w, {
          action: 'confirm',
          email: 'gina@example.com',
          proof: proof('at-other'),
          keep_session: true,
        })
      ).body,
    ).toEqual({ error: 'reauth_mismatch' });
    expect(w.ended).toEqual(['ug:s1', 'ux:s2']); // a stray sign-in is ended
  });

  it('weak passwords and unknown accounts are refused', async () => {
    const w = world();
    expect(
      (
        await run(w, {
          action: 'set_password',
          email: 'a@example.com',
          ticket: 't',
          new_password: 'short',
        })
      ).body,
    ).toEqual({
      error: 'weak_password',
      reason: 'too_short',
    });
    expect(
      (
        await run(w, {
          action: 'confirm',
          email: 'nobody@example.com',
          proof: { provider: 'google', id_token: 'x' },
        })
      ).body,
    ).toEqual({
      error: 'reauth_mismatch',
    });
  });
});

it('claimFlag reads booleans and Apple’s "true" strings', () => {
  expect(claimFlag(true)).toBe(true);
  expect(claimFlag('true')).toBe(true);
  expect(claimFlag('false')).toBe(false);
  expect(claimFlag(undefined)).toBe(false);
});
