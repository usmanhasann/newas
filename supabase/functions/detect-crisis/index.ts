// detect-crisis — System 2 (crisis SUPPORT), never moderation. Classifies whether a possible-hit
// excerpt indicates the WRITER's OWN suicidal ideation / self-harm intent, so the app can OFFER the
// crisis-resources popup. It is reached only AFTER an on-device keyword prescreen hit.
//
// Circle posts only (body.source = 'circle_post'). Journal entries are keywords only (client revisions
// 10/14 p.36, N18): for them, and for older app builds that don't send a source, this answers from the
// database's keyword list and nothing is sent to the AI.
//
// Hard guarantees (System 2's one rule): this stores NOTHING, logs NO content, and its result can
// only ever open the resources popup — it never writes a flag, warning, restriction, strike, or any
// record tied to a person. It also FAILS OPEN: if the model or config is unavailable it returns
// crisis:true, because a prescreen hit already occurred and over-offering support is always safer
// than missing a crisis.
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { hasCrisisWords } from '../_shared/crisisWords.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const MAX_TEXT = 4000;
const RATE_LIMIT = 20; // per user per minute
const RATE_WINDOW_MS = 60_000;

// Best-effort, in-memory, per-instance rate limiter. Deliberately NOT persisted: a durable per-user
// log of crisis scans would itself be a record that a user may be in crisis — which System 2 forbids.
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT;
}

const SYSTEM_PROMPT =
  'You are a careful safety classifier for a private journaling app. Decide ONLY whether the ' +
  "user's text indicates the WRITER'S OWN suicidal ideation or self-harm intent — for example " +
  'hopelessness combined with a plan or timeframe, or a direct statement of intent to end their ' +
  'life or seriously harm themselves (e.g. "I am going to end it today", "today is the day"). ' +
  'This is about the writer\'s OWN safety ONLY. Do NOT classify ordinary sadness, anger, venting, ' +
  'figurative language ("this workout is killing me"), or threats toward OTHER people as self-harm. ' +
  'Respond with STRICT JSON and nothing else: {"crisis": true} or {"crisis": false}.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT (used only for rate-limiting; never stored).
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
    if (!text) return json({ error: 'text required' }, 400);

    // Journal entries are keywords only (client 10/14 p.36): their text is never sent to any AI. The
    // app checks entries on the phone now; this answers older app builds, and anything that doesn't
    // say it's a Circle post, from the database's keyword list alone. If the list can't be read it
    // fails open to support, like the rest of this path.
    if (body?.source !== 'circle_post') {
      const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceKey);
      try {
        const crisis = await hasCrisisWords((fn, args) => admin.rpc(fn, args), fullText);
        return json({ crisis, source: 'keywords' });
      } catch {
        return json({ crisis: true, source: 'keywords_unavailable' });
      }
    }

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';
    // Missing config → fail open to support (never withhold help over a config gap).
    if (!apiKey) return json({ crisis: true, source: 'unconfigured' });

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

    if (!aiRes.ok) return json({ crisis: true, source: 'ai_error' }); // fail open
    const data = await aiRes.json().catch(() => null);
    const content: string = data?.choices?.[0]?.message?.content ?? '';

    // Parse the strict-JSON verdict; only a clear `false` suppresses the popup, otherwise fail open.
    let crisis = true;
    try {
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content);
      crisis = parsed?.crisis === true;
    } catch {
      crisis = !/"?crisis"?\s*:\s*false/i.test(content);
    }
    return json({ crisis });
  } catch {
    return json({ crisis: true, source: 'exception' }); // any failure → fail open to support
  }
});
