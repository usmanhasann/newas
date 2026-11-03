// Sign-in & Security server logic (client revisions 10/14, p.17-21, N5): email verification by a
// 6-digit code, change email, change / set a password, forgot password by code, and signing out
// other devices. The Edge Functions (request-email-verification, confirm-email-verification,
// change-email, update-password, password-reset) are thin wrappers that build the real `deps`
// (securityDeps.ts) and call the handlers below.
//
// IMPORT-FREE on purpose (like appleRevoke.ts): only web-standard globals (crypto.subtle,
// crypto.getRandomValues, TextEncoder), so the Deno Edge Functions and the Jest tests run the SAME
// source. Everything that touches the database, the auth server or email goes through `deps`.
//
// Codes: 6 digits, only an HMAC is stored (keyed with a server secret, bound to the purpose, the
// user and the address), 10 minute expiry, single use, locked after 5 wrong tries (the database
// enforces the count, see migration 20261022100000), a 60 second resend cooldown and an hourly
// cap. Codes are never logged and never returned to the app.

export const CODE_TTL_SECONDS = 600;
export const CODE_MINUTES = CODE_TTL_SECONDS / 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODES_PER_HOUR = 6;
export const PASSWORD_MIN = 8;
/** bcrypt (the auth server's hash) only reads the first 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_FAIL_MAX = 5;
export const PASSWORD_FAIL_WINDOW_SECONDS = 15 * 60;
export const EMAIL_FIX_MAX_PER_HOUR = 5;
export const TICKET_TTL_SECONDS = 600;
export const REAUTH_MAX_AGE_SECONDS = 600;
export const RESET_IP_MAX_PER_HOUR = 20;
export const RESET_EMAIL_COOLDOWN_SECONDS = 60;
export const RESET_EMAIL_MAX_PER_HOUR = 5;
export const RESET_VERIFY_IP_MAX = 30;
export const RESET_VERIFY_IP_WINDOW_SECONDS = 15 * 60;
export const RESET_FAIL_MAX = 5;
export const RESET_FAIL_WINDOW_SECONDS = 10 * 60;
/** Per signed-in user, per function: change email, change / set a password, confirm a code. */
export const USER_ACTION_MAX = 20;
export const USER_ACTION_WINDOW_SECONDS = 15 * 60;
export const SUPPORT_EMAIL = 'support@lysm.app';
const MAX_EMAIL_LENGTH = 254;
const MAX_TOKEN_LENGTH = 8192;
const HOUR = 3600;

export type CodePurpose = 'verify_email' | 'change_email' | 'password_reset';
export type SocialProvider = 'google' | 'apple';

export interface Identity {
  provider: string;
  provider_id: string;
  created_at: string | null;
}

export interface Account {
  id: string;
  email: string | null;
  is_anonymous: boolean;
  has_password: boolean;
  /** Oldest first: the first Google / Apple identity is the provider the account was created with. */
  identities: Identity[];
}

/** The signed-in user calling a function (null when the request carries only the anon key). */
export interface Caller {
  id: string;
  isAnonymous: boolean;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type IssueResult =
  | { status: 'issued' | 'active' }
  | { status: 'cooldown' | 'too_many'; retry_after: number };

export type CheckResult =
  | { status: 'ok'; email: string }
  | { status: 'invalid'; attempts_left: number }
  | { status: 'locked' | 'expired' | 'missing' };

/** Proof that the user just signed in again with the provider their account was created with. */
export type ProviderProof =
  | { provider: SocialProvider; id_token: string }
  | { provider: 'google'; access_token: string };

export interface SecurityDeps {
  /** Secret key for the code HMACs (the service role key: server-only, never in the app). */
  hmacKey: string;
  randomCode(): string;
  randomToken(): string;
  account(userId: string): Promise<Account | null>;
  accountByEmail(email: string): Promise<Account | null>;
  /** The verification row: verified + the address that was verified. */
  verification(
    userId: string,
  ): Promise<{ verified: boolean; email: string | null } | null>;
  issueCode(a: {
    userId: string;
    purpose: CodePurpose;
    email: string;
    codeHash: string;
    ttlSeconds: number;
    cooldownSeconds: number;
    maxPerHour: number;
    onlyIfNone: boolean;
  }): Promise<IssueResult>;
  checkCode(userId: string, purpose: CodePurpose, codeHash: string): Promise<CheckResult>;
  voidCode(userId: string, purpose: CodePurpose): Promise<void>;
  issueTicket(userId: string, ticketHash: string, ttlSeconds: number): Promise<boolean>;
  useTicket(userId: string, ticketHash: string): Promise<boolean>;
  rateHit(key: string, windowSeconds: number, max: number): Promise<boolean>;
  rateCount(key: string, windowSeconds: number): Promise<number>;
  rateAdd(key: string): Promise<void>;
  rateClear(key: string): Promise<void>;
  verifyPassword(userId: string, password: string): Promise<boolean>;
  /**
   * Set the password as the server. The auth server then signs out EVERY session of the account
   * (this device too: the app signs in again with the new password). Done this way for change, set
   * and reset alike, so it works whatever the dashboard's "require current password" and "secure
   * password change" settings are.
   */
  updatePasswordAsAdmin(userId: string, password: string): Promise<boolean>;
  /** Set the account email directly (already confirmed by a code), never through a link. */
  updateEmail(userId: string, email: string): Promise<'ok' | 'taken' | 'failed'>;
  markVerified(userId: string, email: string): Promise<boolean>;
  /** Sign out every session of the user except `keepSessionId` (null = all). */
  revokeSessions(userId: string, keepSessionId: string | null): Promise<void>;
  /** End one session (the extra one a browser Google re-authentication signed in). */
  endSession(userId: string, sessionId: string): Promise<void>;
  sendEmail(m: MailMessage): Promise<'sent' | 'not_configured' | 'failed'>;
  /** A valid provider id token's subject and whether it was issued in the last few minutes; null when invalid. */
  verifyIdToken(
    provider: SocialProvider,
    idToken: string,
  ): Promise<{ sub: string; fresh: boolean } | 'not_configured' | null>;
  /** A just-made Google sign-in from the browser fallback: whose it is, its session, whether it is fresh. */
  oauthSession(
    accessToken: string,
  ): Promise<{ userId: string; sessionId: string | null; fresh: boolean } | null>;
}

// ---------------------------------------------------------------------------------------------
// Small helpers (exported for tests)
// ---------------------------------------------------------------------------------------------

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
  );
}

export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** Why a new password is refused, or null when it is fine. */
export function passwordProblem(value: string): 'too_short' | 'too_long' | null {
  if (value.length < PASSWORD_MIN) return 'too_short';
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return 'too_long';
  return null;
}

/** Apple "Hide My Email" relay addresses (p.20). */
export function isAppleRelayEmail(email: string | null | undefined): boolean {
  return !!email && /@privaterelay\.appleid\.com$/i.test(email.trim());
}

/** The Google / Apple identity the account was created with (the oldest one), or null. */
export function originalProvider(
  account: Account,
): (Identity & { provider: SocialProvider }) | null {
  const found = account.identities.find(
    (i) => i.provider === 'google' || i.provider === 'apple',
  );
  return (found as (Identity & { provider: SocialProvider }) | undefined) ?? null;
}

export function hasIdentity(account: Account, provider: string): boolean {
  return account.identities.some((i) => i.provider === provider);
}

/** "s***@gmail.com": enough for the real owner to recognise an address without spelling it out. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

/** The stored form of a code: bound to the purpose, the user and the address it was sent to. */
export function codeHash(
  key: string,
  purpose: CodePurpose,
  userId: string,
  email: string,
  code: string,
): Promise<string> {
  return hmacHex(key, `${purpose}|${userId}|${normalizeEmail(email)}|${code}`);
}

/** A uniformly random 6-digit code (rejection sampling, no modulo bias). */
export function secureCode(): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1_000_000).padStart(6, '0');
  }
}

/** A one-time token (32 random bytes, base64url). */
export function secureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------------------------
// Emails (no dash punctuation, client rule). Colours mirror src/theme/tokens.cjs (brand 500, ink,
// ink-soft); email HTML cannot read the app's tokens.
// ---------------------------------------------------------------------------------------------
const BRAND = '#7B2FBE';
const INK = '#1A1A2E';
const INK_SOFT = '#6C6C7A';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CODE_COPY: Record<
  CodePurpose,
  { subject: string; heading: string; intro: string; ignore: string }
> = {
  verify_email: {
    subject: 'Your LYSM verification code',
    heading: 'Confirm your email',
    intro: 'Enter this code in the LYSM app to confirm your email address.',
    ignore: 'If you didn’t create a LYSM account, you can ignore this email.',
  },
  change_email: {
    subject: 'Confirm your new LYSM email',
    heading: 'Confirm your new email',
    intro: 'Enter this code in the LYSM app to make this your new email address.',
    ignore: 'If you didn’t ask to change your LYSM email, you can ignore this email.',
  },
  password_reset: {
    subject: 'Your LYSM password reset code',
    heading: 'Reset your password',
    intro: 'Enter this code in the LYSM app to choose a new password.',
    ignore:
      'If you didn’t ask to reset your password, you can ignore this email. Your password stays the same.',
  },
};

export function codeEmail(purpose: CodePurpose, to: string, code: string): MailMessage {
  const c = CODE_COPY[purpose];
  const expiry = `This code expires in ${CODE_MINUTES} minutes and works once.`;
  const html =
    `<div style="font-family:system-ui,sans-serif;color:${INK};line-height:1.6">` +
    `<h2 style="color:${BRAND}">${escapeHtml(c.heading)}</h2>` +
    `<p>${escapeHtml(c.intro)}</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;color:${INK}">${escapeHtml(code)}</p>` +
    `<p style="color:${INK_SOFT};font-size:13px">${escapeHtml(expiry)}</p>` +
    `<p style="color:${INK_SOFT};font-size:13px">${escapeHtml(c.ignore)}</p>` +
    `</div>`;
  const text = `${c.heading}\n\n${c.intro}\n\n${code}\n\n${expiry}\n\n${c.ignore}\n`;
  return { to, subject: c.subject, html, text };
}

/** The heads-up to the OLD address after an email change (p.19): no action needed, blocks nothing. */
export function emailChangedNotice(oldEmail: string, newEmail: string): MailMessage {
  const masked = maskEmail(newEmail);
  const lines = [
    `The email address on your LYSM account was just changed to ${masked}.`,
    'If you made this change, there’s nothing else to do.',
    `If you didn’t, please contact us at ${SUPPORT_EMAIL} so we can help secure your account.`,
  ];
  const html =
    `<div style="font-family:system-ui,sans-serif;color:${INK};line-height:1.6">` +
    `<h2 style="color:${BRAND}">Your LYSM email was changed</h2>` +
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
    `</div>`;
  return {
    to: oldEmail,
    subject: 'Your LYSM email was changed',
    html,
    text: `Your LYSM email was changed\n\n${lines.join('\n\n')}\n`,
  };
}

// ---------------------------------------------------------------------------------------------
// Body parsing (the app validates with Zod; everything is validated again here)
// ---------------------------------------------------------------------------------------------
type Obj = Record<string, unknown>;

function asObject(body: unknown): Obj {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Obj)
    : {};
}

function str(o: Obj, key: string, max = 1024): string | null {
  const v = o[key];
  return typeof v === 'string' && v.length <= max ? v : null;
}

function emailField(o: Obj, key: string): string | null {
  const v = str(o, key, MAX_EMAIL_LENGTH + 64);
  if (v === null) return null;
  const e = normalizeEmail(v);
  return isValidEmail(e) ? e : null;
}

function codeField(o: Obj): string | null {
  const v = str(o, 'code', 32);
  if (v === null) return null;
  const c = v.replace(/\s+/g, '');
  return isSixDigitCode(c) ? c : null;
}

export function parseProof(value: unknown): ProviderProof | null {
  const o = asObject(value);
  const provider = o.provider;
  if (provider !== 'google' && provider !== 'apple') return null;
  const idToken = str(o, 'id_token', MAX_TOKEN_LENGTH);
  if (idToken) return { provider, id_token: idToken };
  const accessToken = str(o, 'access_token', MAX_TOKEN_LENGTH);
  if (accessToken && provider === 'google')
    return { provider, access_token: accessToken };
  return null;
}

const ok = (body: Obj): Reply => ({ status: 200, body });
const UNAUTHORIZED: Reply = { status: 401, body: { error: 'unauthorized' } };
const BAD_REQUEST: Reply = { status: 400, body: { error: 'bad_request' } };
const INTERNAL: Reply = { status: 500, body: { error: 'internal' } };

/** Store a fresh code (or keep a live one) and email it. */
async function sendCode(
  deps: SecurityDeps,
  userId: string,
  purpose: CodePurpose,
  email: string,
  onlyIfNone: boolean,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
): Promise<Reply> {
  const code = deps.randomCode();
  const issued = await deps.issueCode({
    userId,
    purpose,
    email,
    codeHash: await codeHash(deps.hmacKey, purpose, userId, email, code),
    ttlSeconds: CODE_TTL_SECONDS,
    cooldownSeconds,
    maxPerHour: MAX_CODES_PER_HOUR,
    onlyIfNone,
  });
  if (issued.status === 'active') return ok({ status: 'active', email });
  if (issued.status === 'cooldown' || issued.status === 'too_many') {
    return ok({ error: 'too_many', retry_after: issued.retry_after });
  }
  const sent = await deps.sendEmail(codeEmail(purpose, email, code));
  if (sent !== 'sent') {
    await deps.voidCode(userId, purpose); // nothing went out: let them ask again straight away
    return ok({
      error: sent === 'not_configured' ? 'email_not_configured' : 'send_failed',
    });
  }
  return ok({ status: 'sent', email });
}

function codeFailure(result: CheckResult): Reply {
  switch (result.status) {
    case 'invalid':
      return ok({ error: 'invalid', attempts_left: result.attempts_left });
    case 'locked':
      return ok({ error: 'locked' });
    case 'expired':
      return ok({ error: 'expired' });
    default:
      return ok({ error: 'no_code' });
  }
}

/** A per-user cap on one function's calls (null = go ahead, else the reply to send). */
async function userRateLimit(
  deps: SecurityDeps,
  fn: string,
  userId: string,
): Promise<Reply | null> {
  const okToGo = await deps.rateHit(
    `${fn}:${userId}`,
    USER_ACTION_WINDOW_SECONDS,
    USER_ACTION_MAX,
  );
  return okToGo
    ? null
    : ok({ error: 'too_many', retry_after: USER_ACTION_WINDOW_SECONDS });
}

/** Current password check shared by change email and change password, with a lockout. */
async function checkCurrentPassword(
  deps: SecurityDeps,
  userId: string,
  password: string | null,
): Promise<Reply | null> {
  if (!password) return ok({ error: 'password_required' });
  const key = `pw-fail:${userId}`;
  const failures = await deps.rateCount(key, PASSWORD_FAIL_WINDOW_SECONDS);
  if (failures >= PASSWORD_FAIL_MAX) return ok({ error: 'too_many_attempts' });
  if (await deps.verifyPassword(userId, password)) {
    await deps.rateClear(key);
    return null;
  }
  await deps.rateAdd(key);
  const left = PASSWORD_FAIL_MAX - (failures + 1);
  return ok(
    left > 0
      ? { error: 'wrong_password', attempts_left: left }
      : { error: 'too_many_attempts' },
  );
}

/** Re-authentication with the account's provider: null when proven, else the reply to send. */
async function checkProviderProof(
  deps: SecurityDeps,
  userId: string,
  identity: Identity & { provider: SocialProvider },
  proof: ProviderProof | null,
): Promise<Reply | null> {
  if (!proof) return ok({ error: 'reauth_required', provider: identity.provider });
  if (proof.provider !== identity.provider) {
    return ok({ error: 'wrong_provider', provider: identity.provider });
  }
  if ('id_token' in proof) {
    const verified = await deps.verifyIdToken(proof.provider, proof.id_token);
    if (verified === 'not_configured')
      return ok({ error: 'reauth_unavailable', provider: identity.provider });
    if (!verified || verified.sub !== identity.provider_id)
      return ok({ error: 'reauth_mismatch' });
    if (!verified.fresh) return ok({ error: 'reauth_expired' });
    return null;
  }
  const session = await deps.oauthSession(proof.access_token);
  // That browser sign-in was only a proof: end its session whoever it belongs to.
  if (session?.sessionId) await deps.endSession(session.userId, session.sessionId);
  if (!session || session.userId !== userId) return ok({ error: 'reauth_mismatch' });
  if (!session.fresh) return ok({ error: 'reauth_expired' });
  return null;
}

// ---------------------------------------------------------------------------------------------
// 1) Verify the email of an email + password sign-up (p.18)
// ---------------------------------------------------------------------------------------------

/**
 * Body: { mode?: 'ensure' | 'resend', email?: string }.
 *  - ensure: send a code unless a usable one was already sent to this address (opening the screen
 *    again never replaces the code the user is about to type).
 *  - resend: a new code (60 second cooldown, hourly cap). "Resend code".
 *  - email: "Wrong email? Change it.": fixes the address on the UNVERIFIED account (never one that
 *    belongs to another account), then sends a fresh code to it.
 */
export async function requestVerification(
  deps: SecurityDeps,
  caller: Caller | null,
  body: unknown,
): Promise<Reply> {
  if (!caller || caller.isAnonymous) return UNAUTHORIZED;
  const o = asObject(body);
  const account = await deps.account(caller.id);
  if (!account || !account.email || !hasIdentity(account, 'email')) {
    return ok({ error: 'not_email_account' }); // Google / Apple verify the email themselves
  }
  let email = normalizeEmail(account.email);
  const v = await deps.verification(caller.id);
  const verified = !!v?.verified && normalizeEmail(v.email ?? '') === email;

  if (o.email !== undefined) {
    const fixed = emailField(o, 'email');
    if (!fixed) return ok({ error: 'invalid_email' });
    if (fixed !== email) {
      if (verified) return ok({ error: 'already_verified' }); // a verified address changes in Sign-in & Security
      if (!(await deps.rateHit(`email-fix:${caller.id}`, HOUR, EMAIL_FIX_MAX_PER_HOUR))) {
        return ok({ error: 'too_many', retry_after: HOUR });
      }
      const other = await deps.accountByEmail(fixed);
      if (other && other.id !== caller.id) return ok({ error: 'email_taken' });
      const updated = await deps.updateEmail(caller.id, fixed);
      if (updated === 'taken') return ok({ error: 'email_taken' });
      if (updated === 'failed') return INTERNAL;
      email = fixed;
      return sendCode(deps, caller.id, 'verify_email', email, false);
    }
  }
  if (verified) return ok({ status: 'already_verified' });
  return sendCode(deps, caller.id, 'verify_email', email, o.mode === 'ensure');
}

/** Body: { code }. Marks the account's CURRENT address verified. */
export async function confirmVerification(
  deps: SecurityDeps,
  caller: Caller | null,
  body: unknown,
): Promise<Reply> {
  if (!caller || caller.isAnonymous) return UNAUTHORIZED;
  const code = codeField(asObject(body));
  if (!code) return BAD_REQUEST;
  const limited = await userRateLimit(deps, 'confirm-verify', caller.id);
  if (limited) return limited;
  const account = await deps.account(caller.id);
  if (!account?.email) return ok({ error: 'no_code' });
  const email = normalizeEmail(account.email);
  const result = await deps.checkCode(
    caller.id,
    'verify_email',
    await codeHash(deps.hmacKey, 'verify_email', caller.id, email, code),
  );
  if (result.status !== 'ok') return codeFailure(result);
  if (!(await deps.markVerified(caller.id, email))) return ok({ error: 'no_code' });
  return ok({ status: 'verified' });
}

// ---------------------------------------------------------------------------------------------
// 2) Change email, signed in only (p.19; Apple relay exception p.21)
// ---------------------------------------------------------------------------------------------

/**
 * Body: { action: 'request', new_email, current_password? , reauth? } | { action: 'confirm', new_email, code }.
 * request: the current password first (an Apple relay account without a password signs in with
 * Apple again instead); refused when the new address belongs to another account (never merged);
 * Google / Apple only accounts are read-only except an Apple relay address. The code goes ONLY to
 * the new address. confirm: the change takes effect now, the new address counts as verified, and a
 * heads-up goes to the old address.
 */
export async function changeEmail(
  deps: SecurityDeps,
  caller: Caller | null,
  body: unknown,
): Promise<Reply> {
  if (!caller || caller.isAnonymous) return UNAUTHORIZED;
  const o = asObject(body);
  const newEmail = emailField(o, 'new_email');
  if (o.action !== 'request' && o.action !== 'confirm') return BAD_REQUEST;
  if (!newEmail) return ok({ error: 'invalid_email' });
  const limited = await userRateLimit(deps, 'change-email', caller.id);
  if (limited) return limited;
  const account = await deps.account(caller.id);
  if (!account || account.is_anonymous) return UNAUTHORIZED;
  const current = normalizeEmail(account.email ?? '');

  if (o.action === 'request') {
    if (newEmail === current) return ok({ error: 'same_email' });
    if (account.has_password) {
      const refused = await checkCurrentPassword(
        deps,
        caller.id,
        str(o, 'current_password'),
      );
      if (refused) return refused;
    } else {
      const apple = account.identities.find((i) => i.provider === 'apple');
      if (!apple || !isAppleRelayEmail(current)) {
        return ok({
          error: 'read_only',
          provider: originalProvider(account)?.provider ?? null,
        });
      }
      const refused = await checkProviderProof(
        deps,
        caller.id,
        apple as Identity & { provider: SocialProvider },
        parseProof(o.reauth),
      );
      if (refused) return refused;
    }
    const other = await deps.accountByEmail(newEmail);
    if (other && other.id !== caller.id) return ok({ error: 'email_taken' });
    return sendCode(deps, caller.id, 'change_email', newEmail, false);
  }

  const code = codeField(o);
  if (!code) return BAD_REQUEST;
  const result = await deps.checkCode(
    caller.id,
    'change_email',
    await codeHash(deps.hmacKey, 'change_email', caller.id, newEmail, code),
  );
  if (result.status !== 'ok') return codeFailure(result);
  const other = await deps.accountByEmail(newEmail);
  if (other && other.id !== caller.id) return ok({ error: 'email_taken' });
  const oldEmail = account.email; // read before the change
  const updated = await deps.updateEmail(caller.id, newEmail);
  if (updated === 'taken') return ok({ error: 'email_taken' });
  if (updated === 'failed') return INTERNAL;
  await deps.markVerified(caller.id, newEmail);
  if (oldEmail && current !== newEmail) {
    // A heads-up only: its result never changes the outcome.
    await deps.sendEmail(emailChangedNotice(oldEmail, newEmail)).catch(() => 'failed');
  }
  return ok({ status: 'changed', email: newEmail });
}

// ---------------------------------------------------------------------------------------------
// 3) Change password / Set a password (p.19-20)
// ---------------------------------------------------------------------------------------------

/**
 * Body: { action: 'change', current_password, new_password } | { action: 'set', new_password, reauth }.
 * change: the current password is required.
 * set (Google / Apple only accounts): only after signing in again with the provider the account was
 * created with. The account's email came from that provider, which verified it, so it counts as
 * verified for the new email sign-in.
 * Afterwards every session of the account is signed out; the reply carries the account's email so
 * the app signs THIS device in again with the new password (other devices stay signed out).
 */
export async function updatePassword(
  deps: SecurityDeps,
  caller: Caller | null,
  body: unknown,
): Promise<Reply> {
  if (!caller || caller.isAnonymous) return UNAUTHORIZED;
  const o = asObject(body);
  if (o.action !== 'change' && o.action !== 'set') return BAD_REQUEST;
  const newPassword = str(o, 'new_password');
  if (newPassword === null) return BAD_REQUEST;
  const problem = passwordProblem(newPassword);
  if (problem) return ok({ error: 'weak_password', reason: problem });
  const limited = await userRateLimit(deps, 'update-password', caller.id);
  if (limited) return limited;
  const account = await deps.account(caller.id);
  if (!account || account.is_anonymous || !account.email) return UNAUTHORIZED;

  if (o.action === 'change') {
    if (!account.has_password) return ok({ error: 'no_password' });
    const current = str(o, 'current_password');
    const refused = await checkCurrentPassword(deps, caller.id, current);
    if (refused) return refused;
    if (current === newPassword) return ok({ error: 'same_password' });
  } else {
    if (account.has_password) return ok({ error: 'has_password' });
    const original = originalProvider(account);
    if (!original) return ok({ error: 'no_provider' });
    const refused = await checkProviderProof(
      deps,
      caller.id,
      original,
      parseProof(o.reauth),
    );
    if (refused) return refused;
  }

  if (!(await deps.updatePasswordAsAdmin(caller.id, newPassword))) return INTERNAL;
  if (o.action === 'set')
    await deps.markVerified(caller.id, normalizeEmail(account.email));
  await deps.revokeSessions(caller.id, null);
  return ok({
    status: o.action === 'change' ? 'changed' : 'set',
    email: normalizeEmail(account.email),
  });
}

// ---------------------------------------------------------------------------------------------
// 4) Forgot password, by code (p.20)
// ---------------------------------------------------------------------------------------------

/**
 * Body: { action: 'request', email } | { action: 'verify', email, code } |
 *       { action: 'complete', email, reset_token, new_password }.
 * request: Google / Apple only accounts get no email, the app shows which provider to use; no email
 * goes to an address without an account, and the answer is the same as for a real one. verify:
 * wrong / unknown answers look alike, and five wrong tries lock it (ask for a new code); a right
 * code also proves the address. complete: sets the password once and signs out every session of
 * the account; the app then signs this device in with the new password. Works signed out (the
 * sign-in page) and signed in ("Forgot your current password?"), the same way.
 */
export async function passwordReset(
  deps: SecurityDeps,
  body: unknown,
  ip: string | null,
): Promise<Reply> {
  const o = asObject(body);
  const action = o.action;
  if (action !== 'request' && action !== 'verify' && action !== 'complete')
    return BAD_REQUEST;
  const email = emailField(o, 'email');
  if (!email) return ok({ error: 'invalid_email' });
  const emailKey = await sha256Hex(email);
  const ipKey = ip ? await sha256Hex(ip) : null;

  if (action === 'request') {
    if (
      ipKey &&
      !(await deps.rateHit(`reset-ip:${ipKey}`, HOUR, RESET_IP_MAX_PER_HOUR))
    ) {
      return ok({ error: 'too_many', retry_after: HOUR });
    }
    const account = await deps.accountByEmail(email);
    const real = account && !account.is_anonymous ? account : null;
    if (real && !real.has_password) {
      const original = originalProvider(real);
      if (original) return ok({ status: 'provider_only', provider: original.provider });
    }
    // The same limits for every address, so answers never tell an account from no account.
    if (
      !(await deps.rateHit(
        `reset-email-min:${emailKey}`,
        RESET_EMAIL_COOLDOWN_SECONDS,
        1,
      ))
    ) {
      return ok({ error: 'too_many', retry_after: RESET_EMAIL_COOLDOWN_SECONDS });
    }
    if (
      !(await deps.rateHit(
        `reset-email-hour:${emailKey}`,
        HOUR,
        RESET_EMAIL_MAX_PER_HOUR,
      ))
    ) {
      return ok({ error: 'too_many', retry_after: HOUR });
    }
    await deps.rateClear(`reset-fail:${emailKey}`); // a new code, new tries
    if (!real || !real.has_password || !real.email) return ok({ status: 'sent' }); // nothing is sent
    // The per-address limits above already pace these, so no second cooldown that could differ.
    const reply = await sendCode(
      deps,
      real.id,
      'password_reset',
      normalizeEmail(real.email),
      false,
      0,
    );
    // The account's own email is never echoed back here.
    return reply.body.status === 'sent' ? ok({ status: 'sent' }) : reply;
  }

  if (action === 'verify') {
    const code = codeField(o);
    if (!code) return BAD_REQUEST;
    if (
      ipKey &&
      !(await deps.rateHit(
        `reset-verify-ip:${ipKey}`,
        RESET_VERIFY_IP_WINDOW_SECONDS,
        RESET_VERIFY_IP_MAX,
      ))
    ) {
      return ok({ error: 'too_many', retry_after: RESET_VERIFY_IP_WINDOW_SECONDS });
    }
    const failKey = `reset-fail:${emailKey}`;
    if ((await deps.rateCount(failKey, RESET_FAIL_WINDOW_SECONDS)) >= RESET_FAIL_MAX) {
      return ok({ error: 'locked' });
    }
    const account = await deps.accountByEmail(email);
    const result =
      account && !account.is_anonymous && account.has_password
        ? await deps.checkCode(
            account.id,
            'password_reset',
            await codeHash(deps.hmacKey, 'password_reset', account.id, email, code),
          )
        : ({ status: 'missing' } as CheckResult);
    if (result.status === 'ok' && account) {
      const ticket = deps.randomToken();
      if (
        !(await deps.issueTicket(account.id, await sha256Hex(ticket), TICKET_TTL_SECONDS))
      ) {
        return INTERNAL;
      }
      // The code reached this inbox, so the address is proven (an older unverified account is
      // verified by it too).
      await deps.markVerified(account.id, email);
      return ok({ status: 'verified', reset_token: ticket });
    }
    if (result.status === 'locked') return ok({ error: 'locked' });
    await deps.rateAdd(failKey);
    if ((await deps.rateCount(failKey, RESET_FAIL_WINDOW_SECONDS)) >= RESET_FAIL_MAX) {
      return ok({ error: 'locked' });
    }
    return ok({ error: 'invalid' }); // wrong, expired or no account: one answer
  }

  const token = str(o, 'reset_token', 512);
  const newPassword = str(o, 'new_password');
  if (!token || newPassword === null) return BAD_REQUEST;
  const problem = passwordProblem(newPassword);
  if (problem) return ok({ error: 'weak_password', reason: problem });
  const account = await deps.accountByEmail(email);
  if (!account || account.is_anonymous || !account.has_password)
    return ok({ error: 'invalid_token' });
  if (!(await deps.useTicket(account.id, await sha256Hex(token))))
    return ok({ error: 'invalid_token' });

  // Every session of the account is signed out; the app then signs this device in with the new
  // password (signed in from "Forgot your current password?" or not).
  if (!(await deps.updatePasswordAsAdmin(account.id, newPassword))) return INTERNAL;
  await deps.rateClear(`pw-fail:${account.id}`);
  await deps.rateClear(`reset-fail:${emailKey}`);
  await deps.revokeSessions(account.id, null);
  return ok({ status: 'reset' });
}

// ---------------------------------------------------------------------------------------------
// 5) Account linking across Email, Google and Apple (client revisions 10/14 p.15-16 and p.19, N4)
// ---------------------------------------------------------------------------------------------
//
// The auth server links a Google / Apple sign-in to an existing account with the same email by
// itself, and that cannot be switched off. So the app asks HERE first, before it gives a provider
// token to the auth server, and only signs in when this says the sign-in is already on an account
// ("existing") or belongs to nobody yet ("new"). When the email is already on another account the
// answer is "link_required" with the ONE way that account proves it's the same person: its password
// if it has one, else the provider it was created with (p.15). Nothing is ever merged here: the app
// links only after that proof, as the signed-in owner (linkIdentity), which adds a way in and never
// removes one (p.16). Only verified emails start this (p.19): the provider must have verified its
// email, and the existing account's email must be verified too.
//
// Body:
//   { action: 'check', provider, id_token }            what a Google / Apple sign-in would do
//   { action: 'email', email }                         an email + password sign-in that failed:
//                                                      is it a Google / Apple only account? (p.16)
//   { action: 'confirm', email, proof, keep_session? } the account's own provider proves it's them
//   { action: 'set_password', email, ticket, new_password }  a first password, only after confirm

export const LINK_IP_MAX = 60;
export const LINK_IP_WINDOW_SECONDS = 15 * 60;
export const LINK_SUB_MAX = 20;
export const LINK_SUB_WINDOW_SECONDS = 15 * 60;
export const LINK_EMAIL_MAX_PER_HOUR = 10;
export const LINK_CONFIRM_FAIL_MAX = 5;
export const LINK_CONFIRM_FAIL_WINDOW_SECONDS = 15 * 60;
export const LINK_SET_MAX = 10;
export const LINK_TICKET_TTL_SECONDS = 600;

/** How the existing account proves it's the same person (p.15). */
export type LinkMethod = 'password' | SocialProvider;

/** The verified claims of a provider id token that linking needs. */
export interface ProviderClaims {
  sub: string;
  /** Lower case, or null when the provider shared none. */
  email: string | null;
  /** The provider says it verified this email. */
  emailVerified: boolean;
  /** Apple "Hide My Email". */
  privateEmail: boolean;
}

export interface LinkDeps extends SecurityDeps {
  /** Milliseconds since the epoch (the clock for the set-password ticket). */
  now(): number;
  /** The account a Google / Apple identity (by its own account id, never its email) belongs to. */
  identityOwner(provider: SocialProvider, sub: string): Promise<string | null>;
  /** A valid provider id token's claims; null when invalid. Not checked for freshness. */
  providerClaims(
    provider: SocialProvider,
    idToken: string,
  ): Promise<ProviderClaims | 'not_configured' | null>;
}

/** Apple and Google send email_verified / is_private_email as booleans or as "true" / "false". */
export function claimFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

/** The account's current email is verified: our own code, or its Google / Apple verified it (p.19). */
async function accountEmailVerified(deps: LinkDeps, account: Account): Promise<boolean> {
  if (!account.email) return false;
  const v = await deps.verification(account.id);
  return !!v?.verified && normalizeEmail(v.email ?? '') === normalizeEmail(account.email);
}

/** The one way the existing account proves it's the same person (p.15), or null when it has none. */
export function linkMethodFor(account: Account): LinkMethod | null {
  if (account.has_password) return 'password';
  return originalProvider(account)?.provider ?? null;
}

function linkTicketPayload(accountId: string, email: string, exp: number): string {
  return `link_set_password|${accountId}|${normalizeEmail(email)}|${exp}`;
}

/** A short-lived ticket for "then set a new password" (p.16): only issued after the proof. */
export async function linkTicket(
  key: string,
  accountId: string,
  email: string,
  exp: number,
): Promise<string> {
  return `${accountId}.${exp}.${await hmacHex(key, linkTicketPayload(accountId, email, exp))}`;
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The account id a ticket was issued for, or null when forged, for another address or expired. */
export async function readLinkTicket(
  key: string,
  ticket: string,
  email: string,
  nowSeconds: number,
): Promise<string | null> {
  const [accountId = '', expText = '', sig = ''] = ticket.split('.');
  const exp = Number(expText);
  if (!accountId || !sig || !Number.isInteger(exp) || exp < nowSeconds) return null;
  const expected = await hmacHex(key, linkTicketPayload(accountId, email, exp));
  return sameText(expected, sig) ? accountId : null;
}

/**
 * The account's own provider proves it's them (p.15). An id token must be fresh and its subject
 * must be the account's original Google / Apple identity. A browser Google sign-in (access token)
 * must be this account and fresh; its session is ended afterwards unless `keepSession` (the app
 * then links on it) and it matched.
 */
async function checkLinkProof(
  deps: LinkDeps,
  account: Account,
  proof: ProviderProof | null,
  keepSession: boolean,
): Promise<Reply | null> {
  const original = originalProvider(account);
  if (!original) return ok({ error: 'no_provider' });
  if (!proof || !('access_token' in proof) || !keepSession) {
    return checkProviderProof(deps, account.id, original, proof);
  }
  if (proof.provider !== original.provider) {
    return ok({ error: 'wrong_provider', provider: original.provider });
  }
  const session = await deps.oauthSession(proof.access_token);
  const matches = !!session && session.userId === account.id && session.fresh;
  // A sign-in into the wrong account (or a stale one) is only a stray proof: end it.
  if (!matches && session?.sessionId) {
    await deps.endSession(session.userId, session.sessionId);
  }
  if (!session || session.userId !== account.id) return ok({ error: 'reauth_mismatch' });
  if (!session.fresh) return ok({ error: 'reauth_expired' });
  return null;
}

export async function accountLink(
  deps: LinkDeps,
  body: unknown,
  ip: string | null,
): Promise<Reply> {
  const o = asObject(body);
  const action = o.action;
  if (
    action !== 'check' &&
    action !== 'email' &&
    action !== 'confirm' &&
    action !== 'set_password'
  ) {
    return BAD_REQUEST;
  }
  const ipKey = ip ? await sha256Hex(ip) : null;
  if (
    ipKey &&
    !(await deps.rateHit(`link-ip:${ipKey}`, LINK_IP_WINDOW_SECONDS, LINK_IP_MAX))
  ) {
    return ok({ error: 'too_many', retry_after: LINK_IP_WINDOW_SECONDS });
  }

  if (action === 'check') {
    const provider = o.provider;
    if (provider !== 'google' && provider !== 'apple') return BAD_REQUEST;
    const idToken = str(o, 'id_token', MAX_TOKEN_LENGTH);
    if (!idToken) return BAD_REQUEST;
    const claims = await deps.providerClaims(provider, idToken);
    if (claims === 'not_configured') return ok({ error: 'not_configured' });
    if (!claims) return ok({ error: 'invalid_token' });
    const subKey = `link-sub:${provider}:${await sha256Hex(claims.sub)}`;
    if (!(await deps.rateHit(subKey, LINK_SUB_WINDOW_SECONDS, LINK_SUB_MAX))) {
      return ok({ error: 'too_many', retry_after: LINK_SUB_WINDOW_SECONDS });
    }
    // Already a way into an account: a plain sign-in (every linked method keeps working, p.16).
    if (await deps.identityOwner(provider, claims.sub)) return ok({ status: 'existing' });
    const relay = !claims.email || claims.privateEmail || isAppleRelayEmail(claims.email);
    const match = claims.email ? await deps.accountByEmail(claims.email) : null;
    const existing = match && !match.is_anonymous ? match : null;
    if (!existing) return ok({ status: 'new', relay });
    // Only verified emails start email-match linking (p.19).
    if (!claims.emailVerified)
      return ok({ status: 'email_unverified', side: 'provider' });
    if (!(await accountEmailVerified(deps, existing))) {
      return ok({ status: 'email_unverified', side: 'account' });
    }
    const method = linkMethodFor(existing);
    if (!method) return ok({ status: 'email_in_use' });
    return ok({ status: 'link_required', method, email: claims.email });
  }

  const email = emailField(o, 'email');
  if (!email) return ok({ error: 'invalid_email' });
  const emailKey = await sha256Hex(email);

  if (action === 'email') {
    if (!(await deps.rateHit(`link-email:${emailKey}`, HOUR, LINK_EMAIL_MAX_PER_HOUR))) {
      return ok({ error: 'too_many', retry_after: HOUR });
    }
    // Only a Google / Apple only account is named (as Forgot password does); an account with a
    // password and no account at all get the same answer.
    const account = await deps.accountByEmail(email);
    const original =
      account && !account.is_anonymous && !account.has_password
        ? originalProvider(account)
        : null;
    return ok(
      original
        ? { status: 'provider_only', provider: original.provider }
        : { status: 'none' },
    );
  }

  if (action === 'confirm') {
    const account = await deps.accountByEmail(email);
    const target = account && !account.is_anonymous ? account : null;
    const failKey = `link-confirm-fail:${target?.id ?? emailKey}`;
    if (
      (await deps.rateCount(failKey, LINK_CONFIRM_FAIL_WINDOW_SECONDS)) >=
      LINK_CONFIRM_FAIL_MAX
    ) {
      return ok({ error: 'too_many_attempts' });
    }
    const refused = target
      ? await checkLinkProof(deps, target, parseProof(o.proof), o.keep_session === true)
      : ok({ error: 'reauth_mismatch' });
    if (refused || !target) {
      if (refused?.body.error === 'reauth_mismatch') await deps.rateAdd(failKey);
      return refused ?? ok({ error: 'reauth_mismatch' });
    }
    await deps.rateClear(failKey);
    const reply: Obj = { status: 'confirmed' };
    if (!target.has_password) {
      const exp = Math.floor(deps.now() / 1000) + LINK_TICKET_TTL_SECONDS;
      reply.ticket = await linkTicket(deps.hmacKey, target.id, email, exp);
    }
    return ok(reply);
  }

  // set_password: a brand new password, only after the provider proved it's them (p.16).
  const ticket = str(o, 'ticket', 512);
  const newPassword = str(o, 'new_password');
  if (!ticket || newPassword === null) return BAD_REQUEST;
  const problem = passwordProblem(newPassword);
  if (problem) return ok({ error: 'weak_password', reason: problem });
  const accountId = await readLinkTicket(
    deps.hmacKey,
    ticket,
    email,
    Math.floor(deps.now() / 1000),
  );
  if (!accountId) return ok({ error: 'invalid_ticket' });
  if (
    !(await deps.rateHit(
      `link-set:${accountId}`,
      USER_ACTION_WINDOW_SECONDS,
      LINK_SET_MAX,
    ))
  ) {
    return ok({ error: 'too_many', retry_after: USER_ACTION_WINDOW_SECONDS });
  }
  const account = await deps.account(accountId);
  if (!account || account.is_anonymous || normalizeEmail(account.email ?? '') !== email) {
    return ok({ error: 'invalid_ticket' });
  }
  // Never replaces a password that exists (linking adds a way in, never removes one, p.16).
  if (account.has_password) return ok({ error: 'has_password' });
  if (!(await deps.updatePasswordAsAdmin(account.id, newPassword))) return INTERNAL;
  // The provider verified this email, so the new email sign-in is never asked for a code.
  await deps.markVerified(account.id, email);
  await deps.revokeSessions(account.id, null);
  return ok({ status: 'set', email });
}
