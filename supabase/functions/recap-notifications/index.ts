// recap-notifications — the "your recap is ready" push, run on a schedule (pg_cron → net.http_post,
// every 30 minutes).
//
// Thin sender: claim_recap_pushes() (service role, in SQL) decides everything — whose local 9 AM it
// is, whose Weekly / Monthly / Yearly card unlocked today (its period ended yesterday and had an
// entry, and wasn't already opened before 9 AM), their switch, and once-per-period dedupe. Before
// pushing, this asks generate-reflections (the same idempotent call Insights makes on open) to write
// the new recap, so it's there when they tap. That step is best-effort: if it fails the push still
// goes and the app writes the recap on open.
//
// Everything that unlocked for one person in a run goes out as ONE push (client revisions 10/14 p.9),
// carrying the recap and the exact period a tap opens on Insights (recapPushData). While the app is
// open the phone shows it as an in-app banner instead (the app decides that, not this function).
//
// Auth: the scheduler passes a shared x-cron-secret (matched against CRON_SECRET); there is no user
// actor. A failure for one person never aborts the run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import {
  groupRecapClaims,
  recapPushCopyFor,
  recapPushData,
  type RecapClaim,
} from '../_shared/recapPush.ts';
import { recordNotices } from '../_shared/notificationsList.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

/** Stop pre-writing recaps after this long, so a big run always gets its pushes out. */
const GENERATE_BUDGET_MS = 90_000;
/** Longest wait for one person's recap to be written. */
const GENERATE_TIMEOUT_MS = 25_000;

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const secret = env('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }

    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.rpc('claim_recap_pushes', {
      run_at: new Date().toISOString(),
    });
    if (error) return json({ error: 'claim_failed', detail: error.message }, 500);

    // One person can have more than one recap unlock the same day (e.g. weekly + monthly): they get
    // ONE notification for all of them (client revisions 10/14 p.9).
    const byUser = groupRecapClaims((data ?? []) as RecapClaim[]);

    const started = Date.now();
    let sent = 0;
    for (const [userId, claims] of byUser) {
      const msg = recapPushCopyFor(claims.map((c) => c.type));
      const pushData = recapPushData(claims);
      // Saved to their in-app notifications list too (client 10/14 p.8), phone or no phone.
      await recordNotices(admin, [userId], { kind: 'recap', ...msg, data: pushData });
      const { data: toks } = await admin
        .from('device_tokens')
        .select('token')
        .eq('user_id', userId)
        .eq('enabled', true);
      const tokens = (toks ?? []).map((t: { token: string }) => t.token);
      if (tokens.length === 0) continue;

      if (Date.now() - started < GENERATE_BUDGET_MS) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-reflections`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId }),
            signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
          });
        } catch {
          // best-effort — the app writes it when Insights opens
        }
      }

      const { sent: n, invalidTokens } = await sendExpoPush(tokens, msg.title, msg.body, pushData);
      sent += n;
      if (invalidTokens.length > 0) {
        await admin
          .from('device_tokens')
          .update({ enabled: false })
          .in('token', invalidTokens);
      }
    }
    return json({ status: 'ok', recipients: byUser.size, sent });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
