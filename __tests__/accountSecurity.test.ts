/**
 * Sign-in & Security server flows (N5, client revisions 10/14 p.17-21), run on the SAME source as
 * the Edge Functions (supabase/functions/_shared/accountSecurity.ts) with an in-memory stand-in for
 * the database, the auth server and email. The stand-in follows the SQL of migration
 * 20261022100000 (one code per user + purpose, 5 wrong tries lock it, expiry, single use, cooldown,
 * hourly cap), which supabase/tests/sign_in_security_codes.test.sql checks against Postgres.
 */
import {
  CODE_TTL_SECONDS,
  changeEmail,
  codeEmail,
  codeHash,
  confirmVerification,
  emailChangedNotice,
  isAppleRelayEmail,
  maskEmail,
  passwordProblem,
  passwordReset,
  requestVerification,
  secureCode,
  secureToken,
  updatePassword,
  type Account,
  type Caller,
  type CheckResult,
  type CodePurpose,
  type IssueResult,
  type MailMessage,
  type SecurityDeps,
} from '../supabase/functions/_shared/accountSecurity';

interface CodeRow {
  email: string;
  hash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  ticket: string | null;
  ticketExpiresAt: number;
  sentAt: number;
  windowStart: number;
  windowSends: number;
}

function world() {
  let now = 1_800_000_000_000;
  let codeSeq = 0;
  let tokenSeq = 0;
  const accounts = new Map<string, Account>();
  const passwords = new Map<string, string>();
  const verifications = new Map<string, { verified: boolean; email: string | null }>();
  const codes = new Map<string, CodeRow>();
  const rate = new Map<string, number[]>();
  const sessions = new Map<string, Set<string>>();
  const mail: MailMessage[] = [];
  const calls: string[] = [];
  const idTokens = new Map<string, string>(); // token -> sub
  const staleTokens = new Set<string>(); // valid but issued too long ago
  const oauth = new Map<
    string,
    { userId: string; sessionId: string | null; fresh: boolean }
  >();
  const ended: string[] = [];
  const state = {
    sendResult: 'sent' as 'sent' | 'not_configured' | 'failed',
    googleConfigured: true,
  };

  const count = (key: string, windowS: number) =>
    (rate.get(key) ?? []).filter((t) => t > now - windowS * 1000).length;

  const deps: SecurityDeps = {
    hmacKey: 'test-server-secret',
    randomCode: () => String(100000 + ++codeSeq * 7),
    randomToken: () => `ticket-${++tokenSeq}-abcdefghijklmnop`,
    account: async (id) => accounts.get(id) ?? null,
    accountByEmail: async (email) =>
      [...accounts.values()].find(
        (a) => (a.email ?? '').toLowerCase() === email.trim().toLowerCase(),
      ) ?? null,
    verification: async (id) => verifications.get(id) ?? null,
    issueCode: async (a): Promise<IssueResult> => {
      const key = `${a.userId}|${a.purpose}`;
      const r = codes.get(key);
      const email = a.email.trim().toLowerCase();
      if (!r) {
        codes.set(key, {
          email,
          hash: a.codeHash,
          expiresAt: now + a.ttlSeconds * 1000,
          attempts: 0,
          consumed: false,
          ticket: null,
          ticketExpiresAt: 0,
          sentAt: now,
          windowStart: now,
          windowSends: 1,
        });
        return { status: 'issued' };
      }
      if (
        a.onlyIfNone &&
        r.email === email &&
        !r.consumed &&
        r.expiresAt > now &&
        r.attempts < 5
      ) {
        return { status: 'active' };
      }
      if (r.email === email && r.sentAt > now - a.cooldownSeconds * 1000) {
        return {
          status: 'cooldown',
          retry_after: Math.ceil((r.sentAt + a.cooldownSeconds * 1000 - now) / 1000),
        };
      }
      const inWindow = r.windowStart > now - 3600_000;
      if (inWindow && r.windowSends >= a.maxPerHour) {
        return {
          status: 'too_many',
          retry_after: Math.ceil((r.windowStart + 3600_000 - now) / 1000),
        };
      }
      Object.assign(r, {
        email,
        hash: a.codeHash,
        expiresAt: now + a.ttlSeconds * 1000,
        attempts: 0,
        consumed: false,
        ticket: null,
        sentAt: now,
        windowStart: inWindow ? r.windowStart : now,
        windowSends: inWindow ? r.windowSends + 1 : 1,
      });
      return { status: 'issued' };
    },
    checkCode: async (userId, purpose, hash): Promise<CheckResult> => {
      const r = codes.get(`${userId}|${purpose}`);
      if (!r || r.consumed) return { status: 'missing' };
      if (r.attempts >= 5) return { status: 'locked' };
      if (r.expiresAt <= now) return { status: 'expired' };
      if (r.hash !== hash) {
        r.attempts += 1;
        return r.attempts >= 5
          ? { status: 'locked' }
          : { status: 'invalid', attempts_left: 5 - r.attempts };
      }
      r.consumed = true;
      return { status: 'ok', email: r.email };
    },
    voidCode: async (userId, purpose) => {
      codes.delete(`${userId}|${purpose}`);
    },
    issueTicket: async (userId, hash, ttl) => {
      const r = codes.get(`${userId}|password_reset`);
      if (!r || !r.consumed) return false;
      r.ticket = hash;
      r.ticketExpiresAt = now + ttl * 1000;
      return true;
    },
    useTicket: async (userId, hash) => {
      const r = codes.get(`${userId}|password_reset`);
      if (!r || r.ticket !== hash || r.ticketExpiresAt <= now) return false;
      r.ticket = null;
      return true;
    },
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
      calls.push(`asAdmin:${userId}`);
      passwords.set(userId, password);
      accounts.get(userId)!.has_password = true;
      return true;
    },
    updateEmail: async (userId, email) => {
      const taken = [...accounts.values()].some(
        (a) => a.id !== userId && a.email === email,
      );
      if (taken) return 'taken';
      accounts.get(userId)!.email = email;
      // The migration's trigger: verification belongs to an address.
      const v = verifications.get(userId);
      if (v && v.email !== email)
        verifications.set(userId, { verified: false, email: v.email });
      return 'ok';
    },
    markVerified: async (userId, email) => {
      if (accounts.get(userId)?.email !== email) return false;
      verifications.set(userId, { verified: true, email });
      return true;
    },
    revokeSessions: async (userId, keep) => {
      const set = sessions.get(userId) ?? new Set<string>();
      sessions.set(userId, new Set([...set].filter((s) => keep !== null && s === keep)));
    },
    endSession: async (userId, sessionId) => {
      ended.push(`${userId}/${sessionId}`);
      sessions.get(userId)?.delete(sessionId);
    },
    sendEmail: async (m) => {
      if (state.sendResult === 'sent') mail.push(m);
      return state.sendResult;
    },
    verifyIdToken: async (provider, token) => {
      if (provider === 'google' && !state.googleConfigured) return 'not_configured';
      const sub = idTokens.get(token);
      return sub ? { sub, fresh: !staleTokens.has(token) } : null;
    },
    oauthSession: async (token) => oauth.get(token) ?? null,
  };

  const addAccount = (
    a: Partial<Account> & { id: string },
    password?: string,
    sessionIds: string[] = [],
  ) => {
    accounts.set(a.id, {
      email: null,
      is_anonymous: false,
      has_password: !!password,
      identities: [],
      ...a,
    });
    if (password) passwords.set(a.id, password);
    sessions.set(a.id, new Set(sessionIds));
    return accounts.get(a.id)!;
  };
  const caller = (id: string): Caller => ({ id, isAnonymous: false });
  const lastCode = (to: string) => {
    const m = [...mail].reverse().find((x) => x.to === to);
    return m ? (/\b(\d{6})\b/.exec(m.text)?.[1] ?? null) : null;
  };
  const advance = (seconds: number) => {
    now += seconds * 1000;
  };
  return {
    deps,
    accounts,
    passwords,
    verifications,
    codes,
    sessions,
    mail,
    calls,
    idTokens,
    staleTokens,
    oauth,
    ended,
    rate,
    state,
    addAccount,
    caller,
    lastCode,
    advance,
  };
}

const emailId = (id: string) => ({
  provider: 'email',
  provider_id: id,
  created_at: '2026-01-01T00:00:00Z',
});
const google = (sub: string, at = '2026-01-01T00:00:00Z') => ({
  provider: 'google',
  provider_id: sub,
  created_at: at,
});
const apple = (sub: string, at = '2026-01-02T00:00:00Z') => ({
  provider: 'apple',
  provider_id: sub,
  created_at: at,
});

describe('helpers', () => {
  it('makes uniformly formatted 6-digit codes and long one-time tokens', () => {
    for (let i = 0; i < 200; i++) expect(secureCode()).toMatch(/^\d{6}$/);
    const a = secureToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secureToken()).not.toBe(a);
  });

  it('stores a code only as a keyed hash bound to purpose, user and address', async () => {
    const h = await codeHash('k', 'verify_email', 'u1', 'A@B.co', '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('123456');
    expect(await codeHash('k', 'verify_email', 'u1', 'a@b.co', '123456')).toBe(h);
    expect(await codeHash('k', 'password_reset', 'u1', 'a@b.co', '123456')).not.toBe(h);
    expect(await codeHash('k', 'verify_email', 'u2', 'a@b.co', '123456')).not.toBe(h);
    expect(await codeHash('k', 'verify_email', 'u1', 'c@b.co', '123456')).not.toBe(h);
    expect(await codeHash('other', 'verify_email', 'u1', 'a@b.co', '123456')).not.toBe(h);
  });

  it('checks passwords, relay addresses and masks addresses', () => {
    expect(passwordProblem('short')).toBe('too_short');
    expect(passwordProblem('long enough')).toBeNull();
    expect(passwordProblem('é'.repeat(37))).toBe('too_long'); // 74 bytes
    expect(isAppleRelayEmail('xyz123@privaterelay.appleid.com')).toBe(true);
    expect(isAppleRelayEmail('sam@gmail.com')).toBe(false);
    expect(maskEmail('sam.smith@gmail.com')).toBe('s***@gmail.com');
  });

  it('writes the emails without dash punctuation and with the code, its expiry and single use', () => {
    const purposes: CodePurpose[] = ['verify_email', 'change_email', 'password_reset'];
    for (const p of purposes) {
      const m = codeEmail(p, 'a@b.co', '482913');
      expect(m.text).toContain('482913');
      expect(m.html).toContain('482913');
      expect(m.text).toContain('expires in 10 minutes');
      expect(m.text).not.toMatch(/[–—]| - /);
      expect(m.subject).not.toContain('482913'); // never on a lock screen preview
    }
    const n = emailChangedNotice('old@b.co', 'new.person@c.co');
    expect(n.to).toBe('old@b.co');
    expect(n.text).toContain('n***@c.co');
    expect(n.text).not.toContain('new.person@c.co');
    expect(n.text).not.toMatch(/[–—]| - /);
    expect(emailChangedNotice('o@b.co', '<x>@c.co').html).not.toContain('<x>');
  });
});

describe('verify email at sign-up (p.18)', () => {
  const setup = () => {
    const w = world();
    w.addAccount(
      { id: 'u1', email: 'sam@example.com', identities: [emailId('u1')] },
      'password123',
    );
    return w;
  };

  it('only signed-in email + password accounts get a code', async () => {
    const w = setup();
    w.addAccount({ id: 'g1', email: 'g@gmail.com', identities: [google('gs')] });
    expect((await requestVerification(w.deps, null, {})).status).toBe(401);
    expect(
      (await requestVerification(w.deps, { ...w.caller('u1'), isAnonymous: true }, {}))
        .status,
    ).toBe(401);
    expect((await requestVerification(w.deps, w.caller('g1'), {})).body).toEqual({
      error: 'not_email_account',
    });
    expect(w.mail).toHaveLength(0);
  });

  it('ensure sends once and keeps a live code; reopening never replaces it', async () => {
    const w = setup();
    const first = await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    expect(first.body).toEqual({ status: 'sent', email: 'sam@example.com' });
    expect(w.mail).toHaveLength(1);
    expect(w.mail[0].to).toBe('sam@example.com');
    const code = w.lastCode('sam@example.com')!;
    w.advance(120);
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' })).body,
    ).toEqual({
      status: 'active',
      email: 'sam@example.com',
    });
    expect(w.mail).toHaveLength(1);
    // The stored row never holds the code itself.
    expect(JSON.stringify([...w.codes.values()])).not.toContain(code);
    expect((await confirmVerification(w.deps, w.caller('u1'), { code })).body).toEqual({
      status: 'verified',
    });
  });

  it('Resend code has a cooldown, then replaces the code (the old one stops working)', async () => {
    const w = setup();
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    const oldCode = w.lastCode('sam@example.com')!;
    w.advance(10);
    const early = await requestVerification(w.deps, w.caller('u1'), { mode: 'resend' });
    expect(early.body).toEqual({ error: 'too_many', retry_after: 50 });
    expect(w.mail).toHaveLength(1);
    w.advance(51);
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'resend' })).body.status,
    ).toBe('sent');
    const newCode = w.lastCode('sam@example.com')!;
    expect(newCode).not.toBe(oldCode);
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: oldCode })).body.error,
    ).toBe('invalid');
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: newCode })).body,
    ).toEqual({
      status: 'verified',
    });
    expect(w.verifications.get('u1')).toEqual({
      verified: true,
      email: 'sam@example.com',
    });
  });

  it('a verified account gets no email', async () => {
    const w = setup();
    w.verifications.set('u1', { verified: true, email: 'sam@example.com' });
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' })).body,
    ).toEqual({
      status: 'already_verified',
    });
    expect(w.mail).toHaveLength(0);
  });

  it('a verified flag for an OLD address does not count', async () => {
    const w = setup();
    w.verifications.set('u1', { verified: true, email: 'old@example.com' });
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' })).body.status,
    ).toBe('sent');
  });

  it('"Wrong email? Change it." fixes the address and sends a fresh code to it right away', async () => {
    const w = setup();
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    w.advance(5); // inside the cooldown of the first address
    const r = await requestVerification(w.deps, w.caller('u1'), {
      email: ' Sam@Example.org ',
    });
    expect(r.body).toEqual({ status: 'sent', email: 'sam@example.org' });
    expect(w.accounts.get('u1')!.email).toBe('sam@example.org');
    const code = w.lastCode('sam@example.org')!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await confirmVerification(w.deps, w.caller('u1'), { code })).body).toEqual({
      status: 'verified',
    });
    expect(w.verifications.get('u1')).toEqual({
      verified: true,
      email: 'sam@example.org',
    });
  });

  it('never moves the account onto an address another account uses, and refuses bad addresses', async () => {
    const w = setup();
    w.addAccount(
      { id: 'u2', email: 'taken@example.com', identities: [emailId('u2')] },
      'pw12345678',
    );
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { email: 'TAKEN@example.com' }))
        .body,
    ).toEqual({
      error: 'email_taken',
    });
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { email: 'not an email' })).body,
    ).toEqual({
      error: 'invalid_email',
    });
    expect(w.mail).toHaveLength(0);
  });

  it('a verified account cannot use the typo fix (that is Change email)', async () => {
    const w = setup();
    w.verifications.set('u1', { verified: true, email: 'sam@example.com' });
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { email: 'x@example.com' }))
        .body,
    ).toEqual({
      error: 'already_verified',
    });
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
  });

  it('a failed send forgets the code so the user can ask again at once', async () => {
    const w = setup();
    w.state.sendResult = 'failed';
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'resend' })).body,
    ).toEqual({
      error: 'send_failed',
    });
    expect(w.codes.size).toBe(0);
    w.state.sendResult = 'not_configured';
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'resend' })).body,
    ).toEqual({
      error: 'email_not_configured',
    });
    w.state.sendResult = 'sent';
    expect(
      (await requestVerification(w.deps, w.caller('u1'), { mode: 'resend' })).body.status,
    ).toBe('sent');
  });

  it('codes: wrong tries count down, five lock it, expiry, single use, bad input', async () => {
    const w = setup();
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    const code = w.lastCode('sam@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: 'abc' })).status,
    ).toBe(400);
    for (let left = 4; left >= 1; left--) {
      expect(
        (await confirmVerification(w.deps, w.caller('u1'), { code: wrong })).body,
      ).toEqual({
        error: 'invalid',
        attempts_left: left,
      });
    }
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: wrong })).body,
    ).toEqual({ error: 'locked' });
    expect((await confirmVerification(w.deps, w.caller('u1'), { code })).body).toEqual({
      error: 'locked',
    });
    expect(w.verifications.get('u1')).toBeUndefined();

    // A new code after the lock works once; it expires after 10 minutes.
    w.advance(61);
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    const fresh = w.lastCode('sam@example.com')!;
    w.advance(CODE_TTL_SECONDS + 1);
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: fresh })).body,
    ).toEqual({ error: 'expired' });
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    const third = w.lastCode('sam@example.com')!;
    expect(
      (
        await confirmVerification(w.deps, w.caller('u1'), {
          code: ` ${third.slice(0, 3)} ${third.slice(3)} `,
        })
      ).body,
    ).toEqual({
      status: 'verified',
    });
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: third })).body,
    ).toEqual({ error: 'no_code' });
  });

  it('a code sent to one address cannot verify another', async () => {
    const w = setup();
    await requestVerification(w.deps, w.caller('u1'), { mode: 'ensure' });
    const code = w.lastCode('sam@example.com')!;
    w.accounts.get('u1')!.email = 'changed@example.com'; // changed some other way meanwhile
    expect((await confirmVerification(w.deps, w.caller('u1'), { code })).body.error).toBe(
      'invalid',
    );
    expect(w.verifications.get('u1')).toBeUndefined();
  });
});

describe('change email, signed in (p.19, p.21)', () => {
  const setup = () => {
    const w = world();
    w.addAccount(
      {
        id: 'u1',
        email: 'sam@example.com',
        identities: [emailId('u1'), google('g-sam', '2026-02-01T00:00:00Z')],
      },
      'password123',
      ['u1-this-phone', 'u1-tablet'],
    );
    w.verifications.set('u1', { verified: true, email: 'sam@example.com' });
    return w;
  };
  const request = (extra: Record<string, unknown>) => ({
    action: 'request',
    new_email: 'sam.new@example.com',
    ...extra,
  });

  it('requires the current password first, with a lockout after 5 wrong tries', async () => {
    const w = setup();
    expect((await changeEmail(w.deps, w.caller('u1'), request({}))).body).toEqual({
      error: 'password_required',
    });
    for (let left = 4; left >= 1; left--) {
      expect(
        (await changeEmail(w.deps, w.caller('u1'), request({ current_password: 'nope' })))
          .body,
      ).toEqual({
        error: 'wrong_password',
        attempts_left: left,
      });
    }
    expect(
      (await changeEmail(w.deps, w.caller('u1'), request({ current_password: 'nope' })))
        .body,
    ).toEqual({
      error: 'too_many_attempts',
    });
    // Even the right password waits out the lockout.
    expect(
      (
        await changeEmail(
          w.deps,
          w.caller('u1'),
          request({ current_password: 'password123' }),
        )
      ).body,
    ).toEqual({
      error: 'too_many_attempts',
    });
    w.advance(15 * 60 + 1);
    expect(
      (
        await changeEmail(
          w.deps,
          w.caller('u1'),
          request({ current_password: 'password123' }),
        )
      ).body,
    ).toEqual({
      status: 'sent',
      email: 'sam.new@example.com',
    });
  });

  it('the code goes ONLY to the new address and nothing changes until it is confirmed', async () => {
    const w = setup();
    await changeEmail(
      w.deps,
      w.caller('u1'),
      request({ current_password: 'password123' }),
    );
    expect(w.mail.map((m) => m.to)).toEqual(['sam.new@example.com']);
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
    const code = w.lastCode('sam.new@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    const confirm = (c: string) =>
      changeEmail(w.deps, w.caller('u1'), {
        action: 'confirm',
        new_email: 'sam.new@example.com',
        code: c,
      });
    expect((await confirm(wrong)).body).toEqual({ error: 'invalid', attempts_left: 4 });
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
    expect((await confirm(code)).body).toEqual({
      status: 'changed',
      email: 'sam.new@example.com',
    });
    expect(w.accounts.get('u1')!.email).toBe('sam.new@example.com');
    expect(w.verifications.get('u1')).toEqual({
      verified: true,
      email: 'sam.new@example.com',
    });
    // A heads-up to the OLD address, needing no action.
    const notice = w.mail.find((m) => m.to === 'sam@example.com')!;
    expect(notice.subject).toBe('Your LYSM email was changed');
    expect(notice.text).toContain('s***@example.com');
    // Linked Google stays on the account (matched by its own id, not the email text).
    expect(w.accounts.get('u1')!.identities.map((i) => i.provider_id)).toEqual([
      'u1',
      'g-sam',
    ]);
    // The code works once.
    expect((await confirm(code)).body).toEqual({ error: 'no_code' });
  });

  it('a code for one new address cannot confirm a different one', async () => {
    const w = setup();
    await changeEmail(
      w.deps,
      w.caller('u1'),
      request({ current_password: 'password123' }),
    );
    const code = w.lastCode('sam.new@example.com')!;
    const r = await changeEmail(w.deps, w.caller('u1'), {
      action: 'confirm',
      new_email: 'other@example.com',
      code,
    });
    expect(r.body.error).toBe('invalid');
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
  });

  it('blocks an address that belongs to another account, before and at confirm (never merged)', async () => {
    const w = setup();
    w.addAccount(
      { id: 'u2', email: 'taken@example.com', identities: [emailId('u2')] },
      'pw12345678',
    );
    const r = await changeEmail(w.deps, w.caller('u1'), {
      ...request({ current_password: 'password123' }),
      new_email: 'Taken@Example.com',
    });
    expect(r.body).toEqual({ error: 'email_taken' });
    expect(w.mail).toHaveLength(0);

    await changeEmail(
      w.deps,
      w.caller('u1'),
      request({ current_password: 'password123' }),
    );
    const code = w.lastCode('sam.new@example.com')!;
    w.addAccount(
      { id: 'u3', email: 'sam.new@example.com', identities: [emailId('u3')] },
      'pw12345678',
    );
    const c = await changeEmail(w.deps, w.caller('u1'), {
      action: 'confirm',
      new_email: 'sam.new@example.com',
      code,
    });
    expect(c.body).toEqual({ error: 'email_taken' });
    expect(w.accounts.get('u1')!.email).toBe('sam@example.com');
    expect(w.accounts.get('u3')!.email).toBe('sam.new@example.com');
  });

  it('refuses the same address and bad input', async () => {
    const w = setup();
    expect(
      (
        await changeEmail(w.deps, w.caller('u1'), {
          action: 'request',
          new_email: 'SAM@example.com',
          current_password: 'password123',
        })
      ).body,
    ).toEqual({ error: 'same_email' });
    expect(
      (
        await changeEmail(w.deps, w.caller('u1'), {
          action: 'request',
          new_email: 'nope',
        })
      ).body,
    ).toEqual({ error: 'invalid_email' });
    expect(
      (
        await changeEmail(w.deps, w.caller('u1'), {
          action: 'other',
          new_email: 'a@b.co',
        })
      ).status,
    ).toBe(400);
    expect((await changeEmail(w.deps, null, request({}))).status).toBe(401);
  });

  it('Google / Apple only accounts are read-only', async () => {
    const w = world();
    w.addAccount({ id: 'g1', email: 'g@gmail.com', identities: [google('gs')] });
    w.addAccount({ id: 'a1', email: 'real@icloud.com', identities: [apple('as')] });
    expect(
      (
        await changeEmail(w.deps, w.caller('g1'), {
          action: 'request',
          new_email: 'x@y.co',
        })
      ).body,
    ).toEqual({
      error: 'read_only',
      provider: 'google',
    });
    expect(
      (
        await changeEmail(w.deps, w.caller('a1'), {
          action: 'request',
          new_email: 'x@y.co',
        })
      ).body,
    ).toEqual({
      error: 'read_only',
      provider: 'apple',
    });
    expect(w.mail).toHaveLength(0);
  });

  it('an Apple relay address can be replaced after signing in with Apple again (the one exception)', async () => {
    const w = world();
    w.addAccount({
      id: 'a1',
      email: 'xyz123@privaterelay.appleid.com',
      identities: [apple('apple-sub-1')],
    });
    const base = { action: 'request', new_email: 'me@gmail.com' };
    expect((await changeEmail(w.deps, w.caller('a1'), base)).body).toEqual({
      error: 'reauth_required',
      provider: 'apple',
    });
    w.idTokens.set('tok-other', 'apple-sub-2');
    expect(
      (
        await changeEmail(w.deps, w.caller('a1'), {
          ...base,
          reauth: { provider: 'apple', id_token: 'tok-other' },
        })
      ).body,
    ).toEqual({
      error: 'reauth_mismatch',
    });
    w.idTokens.set('tok-me', 'apple-sub-1');
    expect(
      (
        await changeEmail(w.deps, w.caller('a1'), {
          ...base,
          reauth: { provider: 'apple', id_token: 'tok-me' },
        })
      ).body,
    ).toEqual({
      status: 'sent',
      email: 'me@gmail.com',
    });
    const code = w.lastCode('me@gmail.com')!;
    expect(
      (
        await changeEmail(w.deps, w.caller('a1'), {
          action: 'confirm',
          new_email: 'me@gmail.com',
          code,
        })
      ).body,
    ).toEqual({
      status: 'changed',
      email: 'me@gmail.com',
    });
    expect(w.accounts.get('a1')!.email).toBe('me@gmail.com');
  });
});

describe('change password / set a password (p.19-20)', () => {
  it('change: the current password is required; then every session is signed out and the app signs in again', async () => {
    const w = world();
    w.addAccount(
      { id: 'u1', email: 'sam@example.com', identities: [emailId('u1')] },
      'password123',
      ['u1-this-phone', 'u1-laptop', 'u1-tablet'],
    );
    const change = (current: string, next = 'brand new pass') =>
      updatePassword(w.deps, w.caller('u1'), {
        action: 'change',
        current_password: current,
        new_password: next,
      });
    expect((await change('password123', 'short')).body).toEqual({
      error: 'weak_password',
      reason: 'too_short',
    });
    expect(
      (
        await updatePassword(w.deps, w.caller('u1'), {
          action: 'change',
          new_password: 'brand new pass',
        })
      ).body,
    ).toEqual({
      error: 'password_required',
    });
    expect((await change('wrong')).body).toEqual({
      error: 'wrong_password',
      attempts_left: 4,
    });
    expect(w.passwords.get('u1')).toBe('password123');
    expect((await change('password123', 'password123')).body).toEqual({
      error: 'same_password',
    });
    expect(w.calls).toEqual([]);
    // The reply names the account's email: the app signs THIS device in with the new password.
    expect((await change('password123')).body).toEqual({
      status: 'changed',
      email: 'sam@example.com',
    });
    expect(w.passwords.get('u1')).toBe('brand new pass');
    expect(w.calls).toEqual(['asAdmin:u1']);
    expect(w.sessions.get('u1')!.size).toBe(0); // the laptop and tablet are signed out
  });

  it('change: refused for an account without a password', async () => {
    const w = world();
    w.addAccount({ id: 'g1', email: 'g@gmail.com', identities: [google('gs')] });
    expect(
      (
        await updatePassword(w.deps, w.caller('g1'), {
          action: 'change',
          current_password: 'x',
          new_password: 'brand new pass',
        })
      ).body,
    ).toEqual({ error: 'no_password' });
  });

  it('set: only after signing in again with the provider the account was created with', async () => {
    const w = world();
    // Created with Google, Apple linked later: Google is the one to use.
    w.addAccount(
      {
        id: 'g1',
        email: 'g@gmail.com',
        identities: [google('google-1'), apple('apple-1', '2026-03-01T00:00:00Z')],
      },
      undefined,
      ['g1-this-phone', 'g1-other'],
    );
    const set = (reauth?: unknown) =>
      updatePassword(w.deps, w.caller('g1'), {
        action: 'set',
        new_password: 'first password',
        reauth,
      });
    expect((await set()).body).toEqual({ error: 'reauth_required', provider: 'google' });
    w.idTokens.set('apple-ok', 'apple-1');
    expect((await set({ provider: 'apple', id_token: 'apple-ok' })).body).toEqual({
      error: 'wrong_provider',
      provider: 'google',
    });
    w.idTokens.set('google-someone-else', 'google-2');
    expect(
      (await set({ provider: 'google', id_token: 'google-someone-else' })).body,
    ).toEqual({ error: 'reauth_mismatch' });
    expect((await set({ provider: 'google', id_token: 'forged' })).body).toEqual({
      error: 'reauth_mismatch',
    });
    w.state.googleConfigured = false;
    expect((await set({ provider: 'google', id_token: 'anything' })).body).toEqual({
      error: 'reauth_unavailable',
      provider: 'google',
    });
    w.state.googleConfigured = true;
    expect(w.passwords.has('g1')).toBe(false);

    w.idTokens.set('google-old', 'google-1');
    w.staleTokens.add('google-old');
    expect((await set({ provider: 'google', id_token: 'google-old' })).body).toEqual({
      error: 'reauth_expired',
    });
    expect(w.passwords.has('g1')).toBe(false);
    w.idTokens.set('google-me', 'google-1');
    expect((await set({ provider: 'google', id_token: 'google-me' })).body).toEqual({
      status: 'set',
      email: 'g@gmail.com',
    });
    expect(w.passwords.get('g1')).toBe('first password');
    expect(w.sessions.get('g1')!.size).toBe(0);
    // Google verified this email: the new email sign-in is never asked for a code.
    expect(w.verifications.get('g1')).toEqual({ verified: true, email: 'g@gmail.com' });
    expect((await set({ provider: 'google', id_token: 'google-me' })).body).toEqual({
      error: 'has_password',
    });
  });

  it('set: the browser Google sign-in must be this account and fresh, and its session is ended', async () => {
    const w = world();
    w.addAccount(
      { id: 'g1', email: 'g@gmail.com', identities: [google('google-1')] },
      undefined,
      ['g1-this-phone'],
    );
    const set = (token: string) =>
      updatePassword(w.deps, w.caller('g1'), {
        action: 'set',
        new_password: 'first password',
        reauth: { provider: 'google', access_token: token },
      });
    w.oauth.set('other-account', {
      userId: 'someone',
      sessionId: 's-other',
      fresh: true,
    });
    w.oauth.set('stale', { userId: 'g1', sessionId: 's-stale', fresh: false });
    w.oauth.set('fresh', { userId: 'g1', sessionId: 's-fresh', fresh: true });
    expect((await set('other-account')).body).toEqual({ error: 'reauth_mismatch' });
    expect((await set('stale')).body).toEqual({ error: 'reauth_expired' });
    expect(w.passwords.has('g1')).toBe(false);
    expect((await set('fresh')).body).toEqual({ status: 'set', email: 'g@gmail.com' });
    // Every proof sign-in was ended, whoever it belonged to.
    expect(w.ended).toEqual(['someone/s-other', 'g1/s-stale', 'g1/s-fresh']);
  });

  it('set: an Apple created account uses Apple', async () => {
    const w = world();
    w.addAccount({
      id: 'a1',
      email: 'x@privaterelay.appleid.com',
      identities: [apple('apple-1')],
    });
    w.idTokens.set('apple-me', 'apple-1');
    expect(
      (
        await updatePassword(w.deps, w.caller('a1'), {
          action: 'set',
          new_password: 'first password',
        })
      ).body,
    ).toEqual({
      error: 'reauth_required',
      provider: 'apple',
    });
    expect(
      (
        await updatePassword(w.deps, w.caller('a1'), {
          action: 'set',
          new_password: 'first password',
          reauth: { provider: 'apple', id_token: 'apple-me' },
        })
      ).body,
    ).toEqual({ status: 'set', email: 'x@privaterelay.appleid.com' });
  });

  it('caps how often one account can call these functions', async () => {
    const w = world();
    w.addAccount(
      { id: 'u1', email: 'sam@example.com', identities: [emailId('u1')] },
      'password123',
    );
    for (let i = 0; i < 20; i++) {
      await updatePassword(w.deps, w.caller('u1'), {
        action: 'change',
        current_password: 'password123',
        new_password: 'password123',
      });
    }
    expect(
      (
        await updatePassword(w.deps, w.caller('u1'), {
          action: 'change',
          current_password: 'password123',
          new_password: 'another one!',
        })
      ).body,
    ).toEqual({ error: 'too_many', retry_after: 900 });
    expect(w.passwords.get('u1')).toBe('password123');
    for (let i = 0; i < 20; i++)
      await changeEmail(w.deps, w.caller('u1'), {
        action: 'confirm',
        new_email: 'x@y.co',
        code: '123456',
      });
    expect(
      (
        await changeEmail(w.deps, w.caller('u1'), {
          action: 'confirm',
          new_email: 'x@y.co',
          code: '123456',
        })
      ).body,
    ).toEqual({
      error: 'too_many',
      retry_after: 900,
    });
    for (let i = 0; i < 20; i++)
      await confirmVerification(w.deps, w.caller('u1'), { code: '123456' });
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: '123456' })).body,
    ).toEqual({
      error: 'too_many',
      retry_after: 900,
    });
    w.advance(901);
    expect(
      (await confirmVerification(w.deps, w.caller('u1'), { code: '123456' })).body,
    ).toEqual({ error: 'no_code' });
  });
});

describe('forgot password by code (p.20)', () => {
  const setup = () => {
    const w = world();
    w.addAccount(
      { id: 'u1', email: 'sam@example.com', identities: [emailId('u1')] },
      'old password',
      ['u1-phone', 'u1-laptop'],
    );
    w.addAccount({
      id: 'g1',
      email: 'g@gmail.com',
      identities: [google('google-1'), apple('apple-1', '2026-05-01T00:00:00Z')],
    });
    w.addAccount({ id: 'a1', email: 'a@icloud.com', identities: [apple('apple-2')] });
    return w;
  };
  const req = (w: ReturnType<typeof world>, email: string, ip = '1.2.3.4') =>
    passwordReset(w.deps, { action: 'request', email }, ip);

  it('Google / Apple only accounts get no email and the provider they were created with', async () => {
    const w = setup();
    expect((await req(w, 'G@gmail.com')).body).toEqual({
      status: 'provider_only',
      provider: 'google',
    });
    expect((await req(w, 'a@icloud.com')).body).toEqual({
      status: 'provider_only',
      provider: 'apple',
    });
    expect(w.mail).toHaveLength(0);
  });

  it('no account: no email, and the same answer as a real account', async () => {
    const w = setup();
    const unknown = await req(w, 'nobody@example.com');
    const real = await req(w, 'sam@example.com');
    expect(unknown.body).toEqual({ status: 'sent' });
    expect(real.body).toEqual({ status: 'sent' });
    expect(w.mail.map((m) => m.to)).toEqual(['sam@example.com']);
    expect(w.mail[0].subject).toBe('Your LYSM password reset code');
    // The same pacing for both.
    expect((await req(w, 'nobody@example.com')).body).toEqual({
      error: 'too_many',
      retry_after: 60,
    });
    expect((await req(w, 'sam@example.com')).body).toEqual({
      error: 'too_many',
      retry_after: 60,
    });
  });

  it('wrong codes and unknown addresses look alike; five tries lock it for both', async () => {
    const w = setup();
    await req(w, 'sam@example.com');
    await req(w, 'nobody@example.com');
    const code = w.lastCode('sam@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    const verify = (email: string, c: string) =>
      passwordReset(w.deps, { action: 'verify', email, code: c }, '1.2.3.4');
    for (let i = 0; i < 4; i++) {
      expect((await verify('sam@example.com', wrong)).body).toEqual({ error: 'invalid' });
      expect((await verify('nobody@example.com', wrong)).body).toEqual({
        error: 'invalid',
      });
    }
    expect((await verify('sam@example.com', wrong)).body).toEqual({ error: 'locked' });
    expect((await verify('nobody@example.com', wrong)).body).toEqual({ error: 'locked' });
    expect((await verify('sam@example.com', code)).body).toEqual({ error: 'locked' });
    // A new code means new tries.
    w.advance(61);
    await req(w, 'sam@example.com');
    const fresh = w.lastCode('sam@example.com')!;
    expect((await verify('sam@example.com', fresh)).body).toEqual({
      status: 'verified',
      reset_token: 'ticket-1-abcdefghijklmnop',
    });
  });

  it('an expired code is refused; a code works once', async () => {
    const w = setup();
    await req(w, 'sam@example.com');
    const code = w.lastCode('sam@example.com')!;
    w.advance(CODE_TTL_SECONDS + 1);
    const verify = (c: string) =>
      passwordReset(
        w.deps,
        { action: 'verify', email: 'sam@example.com', code: c },
        null,
      );
    expect((await verify(code)).body).toEqual({ error: 'invalid' });
    w.advance(61);
    await req(w, 'sam@example.com');
    const fresh = w.lastCode('sam@example.com')!;
    expect((await verify(fresh)).body.status).toBe('verified');
    expect((await verify(fresh)).body).toEqual({ error: 'invalid' });
  });

  // The same whether this device is signed out (sign-in page) or signed in ("Forgot your current
  // password?"): the app signs this device in with the new password afterwards.
  it('complete: new password once, and every session of the account is signed out', async () => {
    const w = setup();
    await req(w, 'sam@example.com');
    const code = w.lastCode('sam@example.com')!;
    const v = await passwordReset(
      w.deps,
      { action: 'verify', email: 'sam@example.com', code },
      null,
    );
    const token = v.body.reset_token as string;
    const complete = (t: string, p = 'my new password') =>
      passwordReset(
        w.deps,
        { action: 'complete', email: 'sam@example.com', reset_token: t, new_password: p },
        null,
      );
    expect((await complete(token, 'short')).body).toEqual({
      error: 'weak_password',
      reason: 'too_short',
    });
    expect((await complete('forged-token')).body).toEqual({ error: 'invalid_token' });
    expect((await complete(token)).body).toEqual({ status: 'reset' });
    expect(w.passwords.get('u1')).toBe('my new password');
    expect(w.calls).toEqual(['asAdmin:u1']);
    expect(w.sessions.get('u1')!.size).toBe(0);
    expect((await complete(token, 'another password')).body).toEqual({
      error: 'invalid_token',
    });
    expect(w.passwords.get('u1')).toBe('my new password');
  });

  it('a right code also proves the address (an older unverified account becomes verified)', async () => {
    const w = setup();
    await req(w, 'sam@example.com');
    const wrong = w.lastCode('sam@example.com') === '000000' ? '111111' : '000000';
    await passwordReset(
      w.deps,
      { action: 'verify', email: 'sam@example.com', code: wrong },
      null,
    );
    expect(w.verifications.get('u1')).toBeUndefined();
    const code = w.lastCode('sam@example.com')!;
    await passwordReset(
      w.deps,
      { action: 'verify', email: 'sam@example.com', code },
      null,
    );
    expect(w.verifications.get('u1')).toEqual({
      verified: true,
      email: 'sam@example.com',
    });
  });

  it('limits requests per IP', async () => {
    const w = setup();
    for (let i = 0; i < 20; i++) await req(w, `n${i}@example.com`, '9.9.9.9');
    expect((await req(w, 'n99@example.com', '9.9.9.9')).body).toEqual({
      error: 'too_many',
      retry_after: 3600,
    });
    expect((await req(w, 'n99@example.com', '8.8.8.8')).body).toEqual({ status: 'sent' });
  });

  it('refuses malformed requests', async () => {
    const w = setup();
    expect(
      (await passwordReset(w.deps, { action: 'nope', email: 'a@b.co' }, null)).status,
    ).toBe(400);
    expect(
      (await passwordReset(w.deps, { action: 'request', email: 'bad' }, null)).body,
    ).toEqual({ error: 'invalid_email' });
    expect(
      (
        await passwordReset(
          w.deps,
          { action: 'verify', email: 'a@b.co', code: '12' },
          null,
        )
      ).status,
    ).toBe(400);
  });
});
