// validate-purchase: every App Store / Google Play purchase is checked with Apple / Google here
// before it grants anything, and the account's store subscription is checked again each time the
// app opens (client revisions 10/14 p.32-38, N17). The app never writes its own entitlement.
//
// Body (signed-in user's JWT required):
//   { action: 'verify', platform: 'ios' | 'android', product_id, token, environment }
//       token = the purchase's signed transaction (iOS) / purchase token (Android)
//   { action: 'refresh', environment }
// Reply { status }: ok | owned_by_other_account | invalid | not_configured | none | skipped.
//
// Secrets: APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY (the In-App Purchase .p8),
// APPLE_BUNDLE_ID (default com.lysm.app); GOOGLE_PLAY_SERVICE_ACCOUNT (service account JSON with
// Play Developer API access), ANDROID_PACKAGE_NAME (default com.lysm.app). A store whose secrets
// are missing answers not_configured. Rate limited per account (auth_rate_hit). Never logs a token.
// The logic lives in _shared/storePurchase.ts (tested in Jest). Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  appleIapConfig,
  fetchAppleState,
  fetchGoogleState,
  googleIapConfig,
  validatePurchase,
  type Entitlement,
  type StoreState,
} from '../_shared/storePurchase.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

/** Purchase checks per account per minute. */
const RATE_MAX = 20;
const RATE_WINDOW_S = 60;

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const url = env('SUPABASE_URL')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user || user.is_anonymous) return json({ status: 'invalid' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const apple = appleIapConfig(env);
    const google = googleIapConfig(env);
    const nowSeconds = () => Math.floor(Date.now() / 1000);
    const body = await req.json().catch(() => ({}));

    const reply = await validatePurchase(
      {
        now: () => Date.now(),
        appleState: apple
          ? (id) => fetchAppleState(apple, id, fetch, nowSeconds())
          : null,
        googleState: google
          ? (token) => fetchGoogleState(google, token, fetch, nowSeconds())
          : null,
        stored: async (environment) => {
          const { data } = await admin
            .from('subscriptions')
            .select('platform, store_transaction_id, updated_at')
            .eq('user_id', user.id)
            .eq('environment', environment)
            .maybeSingle();
          return data
            ? {
                platform: data.platform ?? null,
                storeTransactionId: data.store_transaction_id ?? null,
                updatedAt: data.updated_at ?? null,
              }
            : null;
        },
        apply: async (environment: string, state: StoreState, e: Entitlement) => {
          const { data, error } = await admin.rpc('apply_store_subscription', {
            p_user_id: user.id,
            p_environment: environment,
            p_platform: state.platform,
            p_product_id: state.productId,
            p_plan: e.plan,
            p_status: e.status,
            p_current_period_end: e.currentPeriodEnd,
            p_trial_ends_at: e.trialEndsAt,
            p_had_trial: e.hadTrial,
            p_auto_renew: e.autoRenew,
            p_store_transaction_id: state.storeId,
            p_store_environment: state.sandbox ? 'sandbox' : 'production',
          });
          if (error) throw new Error('apply_failed');
          return String(data);
        },
        allow: async () => {
          const { data, error } = await admin.rpc('auth_rate_hit', {
            p_key: `iap:${user.id}`,
            p_window_seconds: RATE_WINDOW_S,
            p_max: RATE_MAX,
          });
          return error ? true : data === true; // the limiter missing never blocks a purchase
        },
      },
      body,
    );
    return json(reply.body, reply.status);
  } catch (e) {
    console.error(
      'validate-purchase failed: ' + (e instanceof Error ? e.message : 'unknown'),
    );
    return json({ status: 'invalid', error: 'internal' }, 500);
  }
});
