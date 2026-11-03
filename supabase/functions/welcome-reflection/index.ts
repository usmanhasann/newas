// welcome-reflection: the first reflection written from a person's onboarding answers (client
// revisions 10/14 p.33 to p.35, N15). Asked for when they tap "Skip for now" on the first check
// in, or when their check in had concerning words (it gets no AI reflection, N18), and by the
// paywall if it isn't there yet. The paywall shows its first sentence ("BASED ON YOUR ANSWERS"); the
// Journal tab keeps it as the "Welcome reflection" card until the person deletes it.
//
// The answers are option values (never free text), re-validated here (only known values reach the
// AI). Works on the anonymous onboarding session (the row belongs to that user id, which becomes
// their account when they sign up). Idempotent: one row per person, a ready one is returned as is,
// a deleted one is never written again, and two calls at once write it once (the row is claimed
// first). Rate-limited per person. The prompt lives in _shared/welcomeReflection.ts (unit-tested).
// Provider-agnostic OpenAI-compatible call (AI_BASE_URL / AI_API_KEY / AI_MODEL), like ai-summary.
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { resolveTones, combineVoice } from '../_shared/tone.ts';
import { withoutClosingQuestion, withoutDashes } from '../_shared/text.ts';
import {
  WELCOME_REFLECTION_SYSTEM,
  WELCOME_TONE_CLAUSE,
  buildWelcomeReflectionPrompt,
  readWelcomeAnswers,
  welcomeDecision,
  welcomeTonePicks,
} from '../_shared/welcomeReflection.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const RATE_LIMIT = 3; // writes per person per minute (a retry after a failure included)
const MAX_BODY = 4000; // the table's own cap

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT (the anonymous onboarding session counts).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    // The body carries nothing: everything comes from the caller's own saved answers.
    const body = await req.json().catch(() => ({}));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_body' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: row, error: re } = await admin
      .from('welcome_reflections')
      .select('status, body, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (re) return json({ error: 'read_failed' }, 500);

    const decision = welcomeDecision(row, Date.now());
    if (decision === 'ready') return json({ status: 'ready', body: row!.body });
    if (decision === 'deleted') return json({ status: 'deleted', body: null });
    if (decision === 'in_progress') return json({ status: 'pending', body: null });

    // Per-person rate limit on new writes (reuses audit_log, like ai-summary).
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('actor_id', user.id)
      .eq('action', 'ai.welcome_reflection')
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_LIMIT) return json({ error: 'rate_limited' }, 429);

    // Claim the row, so two calls at once (Skip for now + the paywall) write it once.
    let claimed: unknown[] | null = null;
    if (!row) {
      const { data } = await admin
        .from('welcome_reflections')
        .upsert(
          { user_id: user.id, status: 'pending', body: null, error: null },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )
        .select('user_id');
      claimed = data;
    } else {
      const { data } = await admin
        .from('welcome_reflections')
        .update({ status: 'pending', body: null, error: null })
        .eq('user_id', user.id)
        .eq('updated_at', row.updated_at)
        .neq('status', 'deleted')
        .select('user_id');
      claimed = data;
    }
    if (!claimed || claimed.length === 0) return json({ status: 'pending', body: null });

    await admin.from('audit_log').insert({
      actor_id: user.id,
      action: 'ai.welcome_reflection',
      entity_type: 'welcome_reflection',
      entity_id: user.id,
    });

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';
    if (!apiKey) {
      await markFailed(admin, user.id, 'AI not configured');
      return json({ status: 'failed', body: null, error: 'ai_not_configured' }, 500);
    }

    const { data: prof } = await admin
      .from('profiles')
      .select(
        'settings, onboarding_completed, personal_reflection_style, personal_reflection_style_secondary',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    const answers = readWelcomeAnswers(
      (prof?.settings as { onboarding?: unknown } | null)?.onboarding ?? null,
    );
    const [primary, secondary] = welcomeTonePicks(prof ?? null);
    const toneVoice = combineVoice(WELCOME_TONE_CLAUSE, resolveTones(primary, secondary));

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: WELCOME_REFLECTION_SYSTEM },
          { role: 'user', content: buildWelcomeReflectionPrompt({ answers, toneVoice }) },
        ],
        max_tokens: 260,
        temperature: 0.7,
      }),
    });
    if (!aiRes.ok) {
      await markFailed(admin, user.id, `LLM ${aiRes.status}`);
      return json({ status: 'failed', body: null, error: 'llm_error' }, 502);
    }

    const aiJson = await aiRes.json().catch(() => null);
    const raw: string | null = aiJson?.choices?.[0]?.message?.content?.trim() ?? null;
    // House rules the model can still slip on: no dashes, and it never ends on a question.
    const text = raw ? withoutClosingQuestion(withoutDashes(raw)).slice(0, MAX_BODY) : null;
    if (!text) {
      await markFailed(admin, user.id, 'empty completion');
      return json({ status: 'failed', body: null, error: 'empty_completion' }, 502);
    }

    // A delete made while it was being written wins.
    await admin
      .from('welcome_reflections')
      .update({ status: 'ready', body: text, error: null })
      .eq('user_id', user.id)
      .neq('status', 'deleted');

    return json({ status: 'ready', body: text });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function markFailed(admin: any, userId: string, msg: string) {
  await admin
    .from('welcome_reflections')
    .update({ status: 'failed', error: msg })
    .eq('user_id', userId)
    .neq('status', 'deleted');
}
