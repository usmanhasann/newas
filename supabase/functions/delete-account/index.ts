// delete-account — permanently deletes the SIGNED-IN caller's account and personal data.
// It only ever acts on the user identified by the request's JWT (verify_jwt = true), so it can
// never delete anyone else's account. Steps: (0) revoke Sign in with Apple for an Apple account
// (App Store rule; the app sends Apple's one-time code from the user's confirmation, see
// _shared/appleRevoke.ts), (1) retain an anonymized billing record, (2) remove avatar storage
// files (they don't cascade), (3) delete the auth user — which cascade-deletes all personal data
// (profile, entries, check-ins, circle posts/replies/reactions/shares, memberships, reflections,
// device tokens, notification prefs, acquisition, subscription). Deno runtime.
//
// Optional JSON body: { apple_authorization_code?: string }. Apple never blocks the deletion (App
// Store 5.1.1(v): deletion must always be possible): a confirmation with a different Apple ID (that
// Apple ID is left alone), no code (no Apple ID on the phone, Android, older builds), the key not
// set up yet, or Apple failing / timing out are logged with a log-safe reason, and the account is
// still deleted.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { appleRevokeConfig, appleSubjectOf, revokeAppleForDeletion } from '../_shared/appleRevoke.ts';

const MAX_CODE_LENGTH = 4096;

/** The Apple authorization code from the body, or null. Throws 'bad_request' on a malformed body. */
async function readAppleCode(req: Request): Promise<string | null> {
  const text = await req.text();
  if (!text.trim()) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('bad_request');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad_request');
  const code = (body as Record<string, unknown>).apple_authorization_code;
  if (code === undefined || code === null) return null;
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) throw new Error('bad_request');
  return code.trim() || null;
}

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their token — this is the ONLY account the function will touch.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);
    const uid = user.id;

    let appleCode: string | null;
    try {
      appleCode = await readAppleCode(req);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    // 0) Sign in with Apple: revoke first (while the account still exists), never blocking.
    const { outcome: apple, reason } = await revokeAppleForDeletion({
      config: appleRevokeConfig(env),
      code: appleCode,
      expectedSub: appleSubjectOf(user.identities),
      nowSeconds: Math.floor(Date.now() / 1000),
      fetchImpl: fetch,
    });
    if (apple !== 'revoked' && apple !== 'not_apple') {
      // No personal data or secrets in the log: the outcome and the failed step/Apple error code.
      console.warn('delete-account: apple revoke ' + apple + (reason ? ' ' + reason : ''));
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Retain an anonymized billing record BEFORE the cascade removes the live subscription row.
    const { data: sub } = await admin
      .from('subscriptions')
      .select(
        'platform, product_id, plan, status, store_transaction_id, store_environment, current_period_end, created_at',
      )
      .eq('user_id', uid)
      .maybeSingle();
    if (sub) {
      await admin.from('retained_billing_records').insert({
        former_user_id: uid,
        platform: sub.platform,
        product_id: sub.product_id,
        plan: sub.plan,
        status: sub.status,
        store_transaction_id: sub.store_transaction_id,
        store_environment: sub.store_environment,
        current_period_end: sub.current_period_end,
        subscription_started_at: sub.created_at,
      });
    }

    // 2) Remove avatar files (storage objects do NOT cascade with a DB/auth row delete).
    const { data: files } = await admin.storage.from('avatars').list(uid);
    if (files && files.length) {
      await admin.storage.from('avatars').remove(files.map((f: { name: string }) => `${uid}/${f.name}`));
    }

    // 3) Delete the auth user — cascades every personal-data table (see file header).
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return json({ status: 'deleted', apple });
  } catch (e) {
    console.error('delete-account failed:', String(e));
    return json({ error: 'delete_failed' }, 500);
  }
});
