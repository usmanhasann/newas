// circle-join-digest — the Public circle owners' "new members" pushes that were gathered, run on a
// schedule (pg_cron → net.http_post, every minute; see migration 20261022042000).
//
// The first join after a quiet spell is pushed straight away by send-push ("member_joined", sent by
// the app). Anyone who joins in the next 10 minutes waits, and this sweep sends them together once
// the 10 minutes are up ("[Name] and [N] others joined [Circle name]."). It also covers joins made
// from older app builds, which don't send "member_joined".
//
// Auth: the scheduler passes a shared x-cron-secret (matched against CRON_SECRET); there is no user
// actor. A failure for one circle never aborts the run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { deliverJoinDigest } from '../_shared/joinDigest.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

/** Circles handled per run (the rest wait a minute for the next run). */
const PER_RUN = 500;

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const secret = env('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }

    const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.rpc('due_circle_join_digests', { p_limit: PER_RUN });
    if (error) return json({ error: 'due_failed', detail: error.message }, 500);

    const due = (data ?? []) as string[];
    let sent = 0;
    for (const circleId of due) {
      try {
        sent += await deliverJoinDigest(admin, circleId);
      } catch {
        // one circle never aborts the run
      }
    }
    return json({ status: 'ok', circles: due.length, sent });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
