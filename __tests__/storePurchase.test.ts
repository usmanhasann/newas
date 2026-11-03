/**
 * In-app purchases on the server (client revisions 10/14 p.32-38, N17): validate-purchase's logic
 * (supabase/functions/_shared/storePurchase.ts, the SAME source the Edge Function runs), against
 * made-up Apple / Google replies.
 */
import {
  appleApiToken,
  appleStateFrom,
  entitlementFrom,
  fetchAppleState,
  googleGrantJwt,
  googleStateFrom,
  jwsPayload,
  validatePurchase,
  type StoreState,
  type ValidateDeps,
} from '../supabase/functions/_shared/storePurchase';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
/** base64url of bytes / of JSON (no Buffer: the app's types are the phone's, not Node's). */
const b64urlBytes = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64url = (o: unknown) => b64urlBytes(new TextEncoder().encode(JSON.stringify(o)));
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64url = (part: string) =>
  JSON.parse(
    atob(
      part.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (part.length % 4)) % 4),
    ),
  );
const jws = (payload: unknown) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.sig`;

function appleReply(
  tx: Record<string, unknown>,
  status: number,
  renewal: Record<string, unknown> = {},
) {
  return {
    environment: 'Production',
    bundleId: 'com.lysm.app',
    data: [
      {
        subscriptionGroupIdentifier: '2100',
        lastTransactions: [
          {
            originalTransactionId: '1000',
            status,
            signedTransactionInfo: jws({
              bundleId: 'com.lysm.app',
              originalTransactionId: '1000',
              ...tx,
            }),
            signedRenewalInfo: jws({ autoRenewStatus: 1, ...renewal }),
          },
        ],
      },
    ],
  };
}

describe('Apple: what the App Store says', () => {
  it('reads a JWS payload (no signature check: it came from Apple over TLS)', () => {
    expect(jwsPayload(jws({ transactionId: '42' }))).toEqual({ transactionId: '42' });
    expect(jwsPayload('nope')).toBeNull();
    expect(jwsPayload(undefined)).toBeNull();
  });

  it('the Annual plan in its 5-day free trial is trialing until the trial ends (p.33)', () => {
    const state = appleStateFrom(
      appleReply(
        {
          productId: 'lysm.premium.annual',
          expiresDate: NOW + 5 * DAY,
          offerType: 1,
          offerDiscountType: 'FREE_TRIAL',
        },
        1,
      ),
      'com.lysm.app',
    )!;
    expect(state).toMatchObject({
      plan: 'yearly',
      storeId: '1000',
      kind: 'active',
      inTrial: true,
      autoRenew: true,
    });
    expect(entitlementFrom(state, NOW)).toEqual({
      status: 'trialing',
      plan: 'yearly',
      currentPeriodEnd: new Date(NOW + 5 * DAY).toISOString(),
      trialEndsAt: new Date(NOW + 5 * DAY).toISOString(),
      hadTrial: true,
      autoRenew: true,
    });
  });

  it('a cancelled plan keeps access until the paid period ends, then not (p.38)', () => {
    const reply = appleReply(
      { productId: 'lysm.premium.monthly', expiresDate: NOW + 10 * DAY },
      1,
      { autoRenewStatus: 0 },
    );
    const state = appleStateFrom(reply, 'com.lysm.app')!;
    expect(entitlementFrom(state, NOW)).toMatchObject({
      status: 'active',
      autoRenew: false,
      plan: 'monthly',
    });
    expect(entitlementFrom(state, NOW + 11 * DAY).status).toBe('canceled');
  });

  it('expired, billing retry, grace period and refunds', () => {
    const at = (
      status: number,
      tx: Record<string, unknown> = {},
      renewal: Record<string, unknown> = {},
    ) =>
      entitlementFrom(
        appleStateFrom(
          appleReply(
            { productId: 'lysm.premium.annual', expiresDate: NOW - DAY, ...tx },
            status,
            renewal,
          ),
          'com.lysm.app',
        )!,
        NOW,
      ).status;
    expect(at(2)).toBe('canceled');
    expect(at(3)).toBe('past_due');
    expect(at(5)).toBe('canceled');
    // Grace period: access through Apple's grace end.
    expect(at(4, {}, { gracePeriodExpiresDate: NOW + 3 * DAY })).toBe('active');
  });

  it('ignores other apps’ and other products’ transactions', () => {
    expect(
      appleStateFrom(
        { ...appleReply({ productId: 'lysm.premium.annual' }, 1), bundleId: 'x.y' },
        'com.lysm.app',
      ),
    ).toBeNull();
    expect(
      appleStateFrom(
        appleReply({ productId: 'other.product', expiresDate: NOW }, 1),
        'com.lysm.app',
      ),
    ).toBeNull();
  });

  it('asks production first, then the sandbox (TestFlight / App Review), with a signed ES256 token', async () => {
    const { privateKey } = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const der = b64(await crypto.subtle.exportKey('pkcs8', privateKey));
    const config = {
      issuerId: 'issuer',
      keyId: 'KEY123',
      privateKey: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`,
      bundleId: 'com.lysm.app',
    };
    const token = await appleApiToken(config, NOW / 1000);
    expect(jwsPayload(token)).toMatchObject({
      iss: 'issuer',
      aud: 'appstoreconnect-v1',
      bid: 'com.lysm.app',
    });
    expect(fromB64url(token.split('.')[0]!)).toEqual({
      alg: 'ES256',
      kid: 'KEY123',
      typ: 'JWT',
    });

    const calls: string[] = [];
    const fetchFn = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://api.storekit.itunes'))
        return new Response('{}', { status: 404 });
      return new Response(
        JSON.stringify({
          ...appleReply(
            {
              productId: 'lysm.premium.annual',
              expiresDate: NOW + 5 * DAY,
              offerType: 1,
            },
            1,
          ),
          environment: 'Sandbox',
        }),
        { status: 200 },
      );
    });
    const state = await fetchAppleState(config, '2000', fetchFn, NOW / 1000);
    expect(calls).toEqual([
      'https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/2000',
      'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/2000',
    ]);
    expect(state).toMatchObject({ sandbox: true, inTrial: true });
    // A transaction id that isn't one is never sent.
    expect(await fetchAppleState(config, '../x', fetchFn, NOW / 1000)).toBeNull();
  });
});

describe('Google: what Google Play says', () => {
  const sub = (
    over: Record<string, unknown> = {},
    item: Record<string, unknown> = {},
  ) => ({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    startTime: new Date(NOW).toISOString(),
    lineItems: [
      {
        productId: 'lysm.premium.annual',
        expiryTime: new Date(NOW + 5 * DAY).toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: 'annual', offerId: 'free-trial' },
        ...item,
      },
    ],
    ...over,
  });

  it('the free-trial offer is trialing; the token is the subscription’s id', () => {
    const state = googleStateFrom(sub(), 'tok-123')!;
    expect(state).toMatchObject({
      plan: 'yearly',
      storeId: 'tok-123',
      inTrial: true,
      autoRenew: true,
    });
    expect(entitlementFrom(state, NOW).status).toBe('trialing');
    // offerPhase, when Google sends it, decides.
    expect(
      googleStateFrom(sub({}, { offerPhase: { basePrice: {} } }), 't')!.inTrial,
    ).toBe(false);
  });

  it('cancelled keeps access until expiry; on hold, paused, expired, pending', () => {
    const cancelled = googleStateFrom(
      sub(
        { subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' },
        { offerDetails: { basePlanId: 'annual' } },
      ),
      't',
    )!;
    expect(entitlementFrom(cancelled, NOW)).toMatchObject({
      status: 'active',
      autoRenew: false,
    });
    const status = (s: string) =>
      entitlementFrom(googleStateFrom(sub({ subscriptionState: s }), 't')!, NOW).status;
    expect(status('SUBSCRIPTION_STATE_ON_HOLD')).toBe('past_due');
    expect(status('SUBSCRIPTION_STATE_PAUSED')).toBe('paused');
    expect(status('SUBSCRIPTION_STATE_EXPIRED')).toBe('canceled');
    expect(status('SUBSCRIPTION_STATE_PENDING')).toBe('incomplete');
  });

  it('test purchases are sandbox; other products are not ours', () => {
    expect(googleStateFrom(sub({ testPurchase: {} }), 't')!.sandbox).toBe(true);
    expect(googleStateFrom(sub({}, { productId: 'other' }), 't')).toBeNull();
  });

  it('signs the service account grant RS256', async () => {
    const { privateKey } = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const der = b64(await crypto.subtle.exportKey('pkcs8', privateKey));
    const grant = await googleGrantJwt(
      {
        clientEmail: 'sa@x.iam.gserviceaccount.com',
        privateKey: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`,
        packageName: 'com.lysm.app',
      },
      NOW / 1000,
    );
    expect(jwsPayload(grant)).toMatchObject({
      iss: 'sa@x.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
    });
  });
});

describe('validatePurchase: the request', () => {
  const trialState: StoreState = {
    platform: 'ios',
    productId: 'lysm.premium.annual',
    plan: 'yearly',
    storeId: '1000',
    expiresAt: new Date(NOW + 5 * DAY).toISOString(),
    kind: 'active',
    inTrial: true,
    autoRenew: true,
    sandbox: false,
  };
  function deps(over: Partial<ValidateDeps> = {}): ValidateDeps & { applied: unknown[] } {
    const applied: unknown[] = [];
    return {
      applied,
      now: () => NOW,
      appleState: jest.fn(async () => trialState),
      googleState: jest.fn(async () => ({
        ...trialState,
        platform: 'android' as const,
        storeId: 'tok',
      })),
      stored: jest.fn(async () => null),
      apply: jest.fn(async (environment, state, e) => {
        applied.push({ environment, state, e });
        return 'ok';
      }),
      allow: jest.fn(async () => true),
      ...over,
    };
  }

  it('iOS: only the transaction id is taken from the app; Apple says the rest; applied to the account', async () => {
    const d = deps();
    const reply = await validatePurchase(d, {
      action: 'verify',
      platform: 'ios',
      product_id: 'lysm.premium.annual',
      token: jws({
        transactionId: '2000',
        productId: 'lysm.premium.annual',
        expiresDate: NOW + 999 * DAY,
      }),
      environment: 'production',
    });
    expect(reply.body.status).toBe('ok');
    expect(d.appleState).toHaveBeenCalledWith('2000');
    expect(d.applied[0]).toMatchObject({
      environment: 'production',
      e: { status: 'trialing', hadTrial: true },
    });
  });

  it('Android: the purchase token is looked up with Google', async () => {
    const d = deps();
    await validatePurchase(d, {
      action: 'verify',
      platform: 'android',
      product_id: 'lysm.premium.monthly',
      token: 'purchase-token-abc',
      environment: 'development',
    });
    expect(d.googleState).toHaveBeenCalledWith('purchase-token-abc');
  });

  it('a subscription another LYSM account holds is refused', async () => {
    const d = deps({ apply: jest.fn(async () => 'owned_by_other_account') });
    const reply = await validatePurchase(d, {
      action: 'verify',
      platform: 'ios',
      product_id: 'lysm.premium.annual',
      token: jws({ transactionId: '2000' }),
      environment: 'production',
    });
    expect(reply.body.status).toBe('owned_by_other_account');
  });

  it('refuses bad input, unknown products, a store it can’t ask, and anything over the rate limit', async () => {
    const base = {
      action: 'verify',
      platform: 'ios',
      product_id: 'lysm.premium.annual',
      token: jws({ transactionId: '1' }),
      environment: 'production',
    };
    expect(
      (await validatePurchase(deps(), { ...base, environment: 'staging' })).body.status,
    ).toBe('invalid');
    expect(
      (await validatePurchase(deps(), { ...base, product_id: 'free.coins' })).body.status,
    ).toBe('invalid');
    expect(
      (await validatePurchase(deps(), { ...base, token: 'not-a-jws' })).body.status,
    ).toBe('invalid');
    expect((await validatePurchase(deps({ appleState: null }), base)).body.status).toBe(
      'not_configured',
    );
    expect(
      (await validatePurchase(deps({ appleState: jest.fn(async () => null) }), base)).body
        .status,
    ).toBe('invalid');
    expect(
      (await validatePurchase(deps({ allow: jest.fn(async () => false) }), base)).body
        .status,
    ).toBe('skipped');
    expect(
      (await validatePurchase(deps(), { environment: 'production' })).body.status,
    ).toBe('invalid');
  });

  it('refresh (every app open, p.38): re-checks the stored subscription, at most once a minute', async () => {
    const none = await validatePurchase(deps(), {
      action: 'refresh',
      environment: 'production',
    });
    expect(none.body.status).toBe('none');

    const recent = deps({
      stored: jest.fn(async () => ({
        platform: 'ios',
        storeTransactionId: '1000',
        updatedAt: new Date(NOW - 10_000).toISOString(),
      })),
    });
    expect(
      (await validatePurchase(recent, { action: 'refresh', environment: 'production' }))
        .body.status,
    ).toBe('skipped');
    expect(recent.appleState).not.toHaveBeenCalled();

    const due = deps({
      stored: jest.fn(async () => ({
        platform: 'android',
        storeTransactionId: 'tok',
        updatedAt: new Date(NOW - 5 * 60_000).toISOString(),
      })),
    });
    expect(
      (await validatePurchase(due, { action: 'refresh', environment: 'production' })).body
        .status,
    ).toBe('ok');
    expect(due.googleState).toHaveBeenCalledWith('tok');
  });
});
