// detect-private-threat — System 3. Confirms whether a PRIVATE journal/check-in excerpt contains a
// credible threat of violence toward a specific OTHER person, and if so writes a service-role-only
// flag for internal human review + notifies the review team.
//
// This is NEITHER moderation (System 1) NOR support (System 2): it carries NO automated consequence
// and NOTHING the user ever sees. Unlike crisis, it FAILS CLOSED — if the model or config is
// unavailable it does NOT flag, because a false flag means a human reads someone's private journal
// (with possible legal escalation). Only an explicit AI confirmation writes a flag. Reached only
// after an on-device prescreen hit.
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { isSelfHarmOnly } from '../_shared/moderation.ts';
import { hasCrisisWords } from '../_shared/crisisWords.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const MAX_TEXT = 6000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// Best-effort, in-memory, per-instance rate limiter (see detect-crisis — no durable per-user log).
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT;
}

const SYSTEM_PROMPT =
  'You are a careful safety classifier for a private journaling app. Decide ONLY whether the text ' +
  'contains a CREDIBLE THREAT OF VIOLENCE toward a SPECIFIC, IDENTIFIABLE OTHER person (not the ' +
  'writer themselves). Venting, anger, hyperbole ("I could kill him"), figurative language, ' +
  'fiction, or self-harm are NOT credible threats. A credible threat expresses genuine intent to ' +
  'harm a real, identifiable person. Respond with STRICT JSON and nothing else: ' +
  '{"threat": true|false, "confidence": "low"|"medium"|"high", "target": "who", "rationale": "why"}.';

const SOURCES = new Set(['journal_entry', 'checkin_note']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    if (rateLimited(user.id)) return json({ error: 'rate_limited' }, 429);

    const body = await req.json().catch(() => ({}));
    const fullText = typeof body?.text === 'string' ? body.text : '';
    const text = fullText.slice(0, MAX_TEXT).trim();
    const source = typeof body?.source === 'string' && SOURCES.has(body.source) ? body.source : null;
    const sourceId = typeof body?.source_id === 'string' ? body.source_id : null;
    if (!text || !source) return json({ error: 'text and source required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    // Concerning words come first (client 10/14 p.36): a journal or check-in note with a crisis
    // keyword (anywhere in it, the database's list) is never sent to any AI, and nothing is flagged.
    // If the check can't answer, nothing is sent either (fails closed, like the rest of this path).
    try {
      if (await hasCrisisWords((fn, args) => admin.rpc(fn, args), fullText)) {
        return json({ flagged: false, source: 'crisis_words' });
      }
    } catch {
      return json({ flagged: false, source: 'crisis_check_unavailable' });
    }
    // Self-harm with no violence aimed at anyone else is crisis SUPPORT (System 2): no flag, no record.
    if (isSelfHarmOnly(text)) return json({ flagged: false, source: 'self_harm_support' });

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';
    // FAIL CLOSED: without confirmation we do NOT flag (a false flag exposes a private journal).
    if (!apiKey) return json({ flagged: false, source: 'unconfigured' });

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!aiRes.ok) return json({ flagged: false, source: 'ai_error' }); // fail closed

    const data = await aiRes.json().catch(() => null);
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    let assessment: { threat?: boolean } | null = null;
    try {
      assessment = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content);
    } catch {
      assessment = null;
    }
    if (assessment?.threat !== true) return json({ flagged: false });

    // Confirmed — write the internal review flag (service role; never client-readable).
    const { data: flag } = await admin
      .from('private_threat_flags')
      .insert({
        user_id: user.id,
        source,
        source_id: sourceId,
        excerpt: text,
        assessment,
        status: 'pending_review',
      })
      .select('id')
      .single();

    // Notify the review team. The flag row IS the dashboard queue; this is the active alert. The
    // channel is an open question (P3) — wired to an optional webhook, and the alert carries NO
    // journal content (only the flag id) so the notification path never leaks private text.
    const webhook = env('MODERATION_ALERT_WEBHOOK');
    if (webhook && flag?.id) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'private_threat_flag', flag_id: flag.id }),
        });
      } catch {
        /* best-effort alert; the flag is already queued in the dashboard */
      }
    }

    return json({ flagged: true });
  } catch {
    return json({ flagged: false }); // fail closed
  }
});
