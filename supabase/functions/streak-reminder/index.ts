// streak-reminder — the 8pm "keep your streak" push, run on a schedule (pg_cron → net.http_post).
//
// Thin sender: claim_streak_reminders() (service role, in SQL) does all the deciding — who is at their
// local 8pm with a live streak they haven't extended today, dedup'd once per local day — and returns
// each recipient with their streak count and their longest streak before it. This words the message
// (milestone / longest streak / regular, see streakReminderMessage), looks up their device tokens and
// sends via Expo.
//
// Auth: the scheduler passes a shared x-cron-secret (matched against CRON_SECRET); there is no user
// actor. Best-effort — a token/push failure for one user never aborts the run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { recordNotices } from '../_shared/notificationsList.ts';
import { streakReminderMessage } from '../_shared/streakReminder.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const secret = env('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }

    const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.rpc('claim_streak_reminders', {
      run_at: new Date().toISOString(),
    });
    if (error) return json({ error: 'claim_failed', detail: error.message }, 500);

    // previous_longest is absent on a database without migration 20261022020000: treated as none.
    const recipients = (data ?? []) as {
      user_id: string;
      streak: number;
      previous_longest?: number | null;
    }[];
    let sent = 0;
    for (const r of recipients) {
      const msg = streakReminderMessage(r.streak, r.previous_longest ?? 0);
      // Saved to their in-app notifications list too (client 10/14 p.8), phone or no phone.
      await recordNotices(admin, [r.user_id], {
        kind: 'streak_reminder',
        ...msg,
        data: { type: 'streak_reminder' },
      });
      const { data: toks } = await admin
        .from('device_tokens')
        .select('token')
        .eq('user_id', r.user_id)
        .eq('enabled', true);
      const tokens = (toks ?? []).map((t: { token: string }) => t.token);
      if (tokens.length === 0) continue;

      const { sent: n, invalidTokens } = await sendExpoPush(tokens, msg.title, msg.body, {
        type: 'streak_reminder',
      });
      sent += n;
      if (invalidTokens.length > 0) {
        await admin.from('device_tokens').update({ enabled: false }).in('token', invalidTokens);
      }
    }
    return json({ status: 'ok', recipients: recipients.length, sent });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
