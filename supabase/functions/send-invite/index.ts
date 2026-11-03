// send-invite — emails a circle invite (with its join code) via Resend, and records
// the invite. Server-only: validates the caller owns the circle, rate-limits, and
// keeps the Resend key off the client. Deno runtime (Supabase Edge Functions).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);
const RATE_LIMIT = 20; // invites per owner per hour

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const circleId = body.circle_id as string | undefined;
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const inviteeName = (body.invitee_name as string | undefined)?.trim() || null;
    if (!circleId || !email) return json({ error: 'circle_id and email required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: circle } = await admin.from('circles').select('*').eq('id', circleId).single();
    if (!circle) return json({ error: 'not_found' }, 404);
    if (circle.owner_id !== user.id) return json({ error: 'forbidden' }, 403);

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('actor_id', user.id)
      .eq('action', 'invite.email')
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_LIMIT) return json({ error: 'rate_limited' }, 429);

    await admin
      .from('circle_email_invites')
      .upsert(
        {
          circle_id: circleId,
          email,
          invited_by: user.id,
          status: 'pending',
          invitee_name: inviteeName,
        },
        { onConflict: 'circle_id,email' },
      );

    const resendKey = env('RESEND_API_KEY');
    const from = env('RESEND_FROM') ?? 'LYSM <onboarding@resend.dev>';
    if (!resendKey) return json({ error: 'email_not_configured' }, 500);

    const greeting = inviteeName ? `Hi ${inviteeName},` : 'Hi there,';
    const html =
      `<div style="font-family:system-ui,sans-serif;color:#1A1A2E">` +
      `<h2>You're invited to a circle on LYSM</h2>` +
      `<p>${greeting}</p>` +
      `<p>You've been invited to join <strong>${circle.name}</strong>, a private space to share how you're feeling with people who care.</p>` +
      `<p>Open LYSM, go to <em>Circles → Discover circles</em>, and enter:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:3px;color:#7B2FBE">${circle.invite_code}</p>` +
      `</div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `You're invited to ${circle.name} on LYSM`,
        html,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      return json({ error: 'send_failed', detail }, 502);
    }

    await admin.from('audit_log').insert({
      actor_id: user.id,
      action: 'invite.email',
      entity_type: 'circle',
      entity_id: circleId,
      metadata: { email },
    });

    return json({ status: 'sent' });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
