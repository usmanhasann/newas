// In-app purchases: checking a purchase with Apple / Google and turning it into the account's
// entitlement (client revisions 10/14 p.32-38, N17). Used by the validate-purchase Edge Function.
//
// IMPORT-FREE on purpose (like appleRevoke.ts): only web-standard globals (fetch, crypto.subtle,
// atob/btoa, TextEncoder), so the Deno function and the Jest tests run the SAME source. Every
// network call goes through `fetchFn`, so the tests run without the stores.
//
// Apple: App Store Server API (developer.apple.com, "Get All Subscription Statuses"):
//   GET https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
//   (sandbox: api.storekit-sandbox.itunes.apple.com; Apple's advice: try production first, then the
//   sandbox on 404, so TestFlight / App Review purchases work). Auth: a JWT signed ES256 with the
//   In-App Purchase key: header { alg: ES256, kid, typ: JWT }, claims { iss: issuer id, iat, exp
//   (<= 60 min), aud: 'appstoreconnect-v1', bid: bundle id }. The reply comes from Apple over TLS,
//   so its signed transaction / renewal info is read without re-verifying the signature. The app
//   sends the purchase's own signed transaction; only its transactionId is taken from it, and
//   everything that counts is read back from Apple.
//   status: 1 active, 2 expired, 3 billing retry, 4 grace period, 5 revoked.
// Google: Play Developer API purchases.subscriptionsv2.get:
//   GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/
//       purchases/subscriptionsv2/tokens/{purchaseToken}
//   Auth: OAuth access token for a service account (JWT RS256 grant, scope androidpublisher).

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
  if (!body) throw new Error('store_key_invalid');
  return bytesFromBase64(body);
}

// deno-lint-ignore no-explicit-any
type Json = any;
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type Platform = 'ios' | 'android';
export type PlanId = 'monthly' | 'yearly';
export type SubStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'paused';

/** Our two subscriptions, the same ids on both stores (see src/features/iap/products.ts). */
export const PRODUCT_PLANS: Record<string, PlanId> = {
  'lysm.premium.annual': 'yearly',
  'lysm.premium.monthly': 'monthly',
};
export const ANDROID_TRIAL_OFFER_ID = 'free-trial';

/** How long a store request may take. */
export const STORE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------------------------
// Config (Edge Function secrets)
// ---------------------------------------------------------------------------------------------

export interface AppleIapConfig {
  issuerId: string;
  keyId: string;
  /** The In-App Purchase key (.p8, PKCS#8 PEM). Literal "\n" sequences are accepted too. */
  privateKey: string;
  bundleId: string;
}

export interface GoogleIapConfig {
  clientEmail: string;
  /** The service account's RSA key (PKCS#8 PEM). */
  privateKey: string;
  packageName: string;
}

export function appleIapConfig(
  get: (k: string) => string | undefined,
): AppleIapConfig | null {
  const issuerId = get('APPLE_IAP_ISSUER_ID')?.trim();
  const keyId = get('APPLE_IAP_KEY_ID')?.trim();
  const privateKey = get('APPLE_IAP_PRIVATE_KEY')?.trim();
  const bundleId = get('APPLE_BUNDLE_ID')?.trim() || 'com.lysm.app';
  return issuerId && keyId && privateKey
    ? { issuerId, keyId, privateKey, bundleId }
    : null;
}

export function googleIapConfig(
  get: (k: string) => string | undefined,
): GoogleIapConfig | null {
  const raw = get('GOOGLE_PLAY_SERVICE_ACCOUNT')?.trim();
  const packageName = get('ANDROID_PACKAGE_NAME')?.trim() || 'com.lysm.app';
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string')
      return null;
    return { clientEmail: sa.client_email, privateKey: sa.private_key, packageName };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------------------------

async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  privateKeyPem: string,
  algorithm: 'ES256' | 'RS256',
): Promise<string> {
  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der(privateKeyPem),
    algorithm === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // ECDSA: WebCrypto's raw r||s is exactly JWS ES256's signature format.
  const signature = await crypto.subtle.sign(
    algorithm === 'ES256'
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

/** The App Store Server API bearer token. */
export function appleApiToken(
  config: AppleIapConfig,
  nowSeconds: number,
): Promise<string> {
  return signJwt(
    { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
    {
      iss: config.issuerId,
      iat: nowSeconds,
      exp: nowSeconds + 10 * 60,
      aud: 'appstoreconnect-v1',
      bid: config.bundleId,
    },
    config.privateKey,
    'ES256',
  );
}

/** The service account's signed grant, exchanged for an access token. */
export function googleGrantJwt(
  config: GoogleIapConfig,
  nowSeconds: number,
): Promise<string> {
  return signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 10 * 60,
    },
    config.privateKey,
    'RS256',
  );
}

/** The payload of a JWS (header.payload.signature), or null. Not a signature check. */
export function jwsPayload(jws: unknown): Record<string, unknown> | null {
  if (typeof jws !== 'string') return null;
  const part = jws.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = new TextDecoder().decode(bytesFromBase64(padded));
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// What the store says → one state
// ---------------------------------------------------------------------------------------------

/** One subscription as a store reports it. */
export interface StoreState {
  platform: Platform;
  productId: string;
  plan: PlanId;
  /** The id that stays the same across renewals (Apple originalTransactionId / Google token). */
  storeId: string;
  expiresAt: string | null;
  kind:
    | 'active'
    | 'grace'
    | 'billing_retry'
    | 'expired'
    | 'revoked'
    | 'paused'
    | 'pending';
  inTrial: boolean;
  autoRenew: boolean;
  sandbox: boolean;
}

const iso = (ms: unknown): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/**
 * Apple's "Get All Subscription Statuses" reply → our subscription (the one of our products that
 * runs latest), or null when none of ours is in it.
 */
export function appleStateFrom(reply: Json, bundleId: string): StoreState | null {
  if (!reply || (reply.bundleId && reply.bundleId !== bundleId)) return null;
  const sandbox = reply.environment === 'Sandbox';
  let best: StoreState | null = null;
  let bestExpiry = -Infinity;
  for (const group of Array.isArray(reply.data) ? reply.data : []) {
    for (const last of Array.isArray(group?.lastTransactions)
      ? group.lastTransactions
      : []) {
      const tx = jwsPayload(last?.signedTransactionInfo);
      if (!tx) continue;
      const productId = String(tx.productId ?? '');
      const plan = PRODUCT_PLANS[productId];
      if (!plan || (tx.bundleId && tx.bundleId !== bundleId)) continue;
      const renewal = jwsPayload(last?.signedRenewalInfo) ?? {};
      const expiresMs = typeof tx.expiresDate === 'number' ? tx.expiresDate : -Infinity;
      const graceMs =
        typeof renewal.gracePeriodExpiresDate === 'number'
          ? renewal.gracePeriodExpiresDate
          : -Infinity;
      const status = Number(last?.status);
      const kind: StoreState['kind'] =
        status === 1
          ? 'active'
          : status === 4
            ? 'grace'
            : status === 3
              ? 'billing_retry'
              : status === 5 || tx.revocationDate
                ? 'revoked'
                : 'expired';
      const inTrial =
        (kind === 'active' || kind === 'grace') &&
        Number(tx.offerType) === 1 &&
        (tx.offerDiscountType === undefined || tx.offerDiscountType === 'FREE_TRIAL');
      const state: StoreState = {
        platform: 'ios',
        productId,
        plan,
        storeId: String(tx.originalTransactionId ?? last?.originalTransactionId ?? ''),
        expiresAt: iso(kind === 'grace' ? Math.max(expiresMs, graceMs) : expiresMs),
        kind,
        inTrial,
        autoRenew: Number(renewal.autoRenewStatus) === 1,
        sandbox,
      };
      if (!state.storeId) continue;
      if (expiresMs > bestExpiry) {
        best = state;
        bestExpiry = expiresMs;
      }
    }
  }
  return best;
}

/** Google's subscriptionsv2 reply → our subscription, or null when it isn't one of ours. */
export function googleStateFrom(reply: Json, purchaseToken: string): StoreState | null {
  const items: Json[] = Array.isArray(reply?.lineItems) ? reply.lineItems : [];
  const item = items.find((i) => PRODUCT_PLANS[String(i?.productId ?? '')]);
  if (!item) return null;
  const productId = String(item.productId);
  const state = String(reply.subscriptionState ?? '');
  const expiryMs = Date.parse(String(item.expiryTime ?? ''));
  const kind: StoreState['kind'] =
    state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_CANCELED'
      ? 'active'
      : state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
        ? 'grace'
        : state === 'SUBSCRIPTION_STATE_ON_HOLD'
          ? 'billing_retry'
          : state === 'SUBSCRIPTION_STATE_PAUSED'
            ? 'paused'
            : state === 'SUBSCRIPTION_STATE_PENDING'
              ? 'pending'
              : 'expired';
  const startMs = Date.parse(String(reply.startTime ?? ''));
  const phase = item.offerPhase;
  const inTrial =
    (kind === 'active' || kind === 'grace') &&
    (phase
      ? !!phase.freeTrial
      : item.offerDetails?.offerId === ANDROID_TRIAL_OFFER_ID &&
        Number.isFinite(startMs) &&
        Number.isFinite(expiryMs) &&
        expiryMs - startMs <= 6 * 24 * 60 * 60 * 1000);
  return {
    platform: 'android',
    productId,
    plan: PRODUCT_PLANS[productId]!,
    storeId: purchaseToken,
    expiresAt: Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null,
    kind,
    inTrial,
    // A cancelled one still runs to its end, without renewing.
    autoRenew:
      state !== 'SUBSCRIPTION_STATE_CANCELED' &&
      item.autoRenewingPlan?.autoRenewEnabled !== false,
    sandbox: !!reply.testPurchase,
  };
}

/** What the account's subscriptions row becomes (see apply_store_subscription). */
export interface Entitlement {
  status: SubStatus;
  plan: PlanId;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  hadTrial: boolean;
  autoRenew: boolean;
}

/**
 * The store's state as our entitlement (client p.38: a cancelled plan keeps full access until the
 * end of the period already paid for, then the Welcome back paywall).
 */
export function entitlementFrom(state: StoreState, nowMs: number): Entitlement {
  const expiry = state.expiresAt ? Date.parse(state.expiresAt) : NaN;
  const running = Number.isFinite(expiry) && expiry > nowMs;
  let status: SubStatus;
  if ((state.kind === 'active' || state.kind === 'grace') && running) {
    status = state.inTrial ? 'trialing' : 'active';
  } else if (state.kind === 'billing_retry') {
    status = 'past_due';
  } else if (state.kind === 'paused') {
    status = 'paused';
  } else if (state.kind === 'pending') {
    status = 'incomplete';
  } else {
    status = 'canceled';
  }
  return {
    status,
    plan: state.plan,
    currentPeriodEnd: state.expiresAt,
    trialEndsAt: state.inTrial ? state.expiresAt : null,
    hadTrial: state.inTrial,
    autoRenew: state.autoRenew,
  };
}

// ---------------------------------------------------------------------------------------------
// The store requests
// ---------------------------------------------------------------------------------------------

const APPLE_PRODUCTION = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

/** Apple's state for the subscription this transaction belongs to (production, then sandbox). */
export async function fetchAppleState(
  config: AppleIapConfig,
  transactionId: string,
  fetchFn: FetchFn,
  nowSeconds: number,
): Promise<StoreState | null> {
  if (!/^\d{1,30}$/.test(transactionId)) return null;
  const token = await appleApiToken(config, nowSeconds);
  for (const base of [APPLE_PRODUCTION, APPLE_SANDBOX]) {
    const res = await fetchFn(`${base}/inApps/v1/subscriptions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (res.status === 404) continue; // not this environment: try the other
    if (!res.ok) throw new Error(`apple_status_${res.status}`);
    return appleStateFrom(await res.json(), config.bundleId);
  }
  return null;
}

/** Google's state for this purchase token. */
export async function fetchGoogleState(
  config: GoogleIapConfig,
  purchaseToken: string,
  fetchFn: FetchFn,
  nowSeconds: number,
): Promise<StoreState | null> {
  if (!/^[A-Za-z0-9._\-:]{10,2000}$/.test(purchaseToken)) return null;
  const grant = await googleGrantJwt(config, nowSeconds);
  const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(grant)}`,
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!tokenRes.ok) throw new Error(`google_oauth_${tokenRes.status}`);
  const { access_token: accessToken } = (await tokenRes.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error('google_oauth_no_token');
  const res = await fetchFn(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    },
  );
  if (res.status === 404 || res.status === 410 || res.status === 400) return null;
  if (!res.ok) throw new Error(`google_status_${res.status}`);
  return googleStateFrom(await res.json(), purchaseToken);
}

// ---------------------------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------------------------

export type ValidateStatus =
  | 'ok'
  | 'owned_by_other_account'
  | 'invalid'
  | 'not_configured'
  | 'none'
  | 'skipped';

export interface StoredSubscription {
  platform: string | null;
  storeTransactionId: string | null;
  updatedAt: string | null;
}

export interface ValidateDeps {
  now: () => number;
  /** Apple's / Google's state (null: not one of ours / not found); throws on a store failure. */
  appleState: ((transactionId: string) => Promise<StoreState | null>) | null;
  googleState: ((purchaseToken: string) => Promise<StoreState | null>) | null;
  /** The caller's stored store subscription in this environment, or null. */
  stored: (environment: string) => Promise<StoredSubscription | null>;
  /** apply_store_subscription; returns its answer. */
  apply: (
    environment: string,
    state: StoreState,
    entitlement: Entitlement,
  ) => Promise<string>;
  /** True while under the rate limit. */
  allow: () => Promise<boolean>;
}

/** Refresh a stored subscription at most this often (several opens in a row are one check). */
export const REFRESH_MIN_MS = 60_000;

/**
 * { action: 'verify', platform, product_id, token, environment }: check one purchase and apply it.
 * { action: 'refresh', environment }: check the caller's stored store subscription again.
 */
export async function validatePurchase(
  deps: ValidateDeps,
  body: Json,
): Promise<{ status: number; body: { status: ValidateStatus } }> {
  // Every outcome is a 200 with its status in the body: the app reads the status (a non-2xx reply
  // reaches it only as a bare error).
  const reply = (status: ValidateStatus) => ({ status: 200, body: { status } });
  const environment = body?.environment;
  if (environment !== 'development' && environment !== 'production')
    return reply('invalid');
  if (!(await deps.allow())) return reply('skipped');

  let platform: Platform;
  let lookUp: string;
  if (body?.action === 'verify') {
    if (body.platform !== 'ios' && body.platform !== 'android') return reply('invalid');
    if (typeof body.product_id !== 'string' || !PRODUCT_PLANS[body.product_id])
      return reply('invalid');
    if (typeof body.token !== 'string' || body.token.length > 20_000)
      return reply('invalid');
    platform = body.platform;
    if (platform === 'ios') {
      // The purchase's own signed transaction: only its id is used; Apple says the rest.
      const tx = jwsPayload(body.token);
      const id = tx?.transactionId ?? tx?.originalTransactionId;
      if (typeof id !== 'string' && typeof id !== 'number') return reply('invalid');
      lookUp = String(id);
    } else {
      lookUp = body.token;
    }
  } else if (body?.action === 'refresh') {
    const stored = await deps.stored(environment);
    if (
      !stored?.storeTransactionId ||
      (stored.platform !== 'ios' && stored.platform !== 'android')
    ) {
      return reply('none');
    }
    const updated = stored.updatedAt ? Date.parse(stored.updatedAt) : NaN;
    if (Number.isFinite(updated) && deps.now() - updated < REFRESH_MIN_MS)
      return reply('skipped');
    platform = stored.platform;
    lookUp = stored.storeTransactionId;
  } else {
    return reply('invalid');
  }

  const fetchState = platform === 'ios' ? deps.appleState : deps.googleState;
  if (!fetchState) return reply('not_configured');
  const state = await fetchState(lookUp);
  if (!state) return reply('invalid');
  const answer = await deps.apply(environment, state, entitlementFrom(state, deps.now()));
  if (answer === 'ok') return reply('ok');
  if (answer === 'owned_by_other_account') return reply('owned_by_other_account');
  return reply('invalid');
}
