// moderate-circle-content — System 1 (Circles moderation) enforcement pipeline.
//
// Two modes:
//   pre_post  — synchronous, high-confidence severe gate. Reached only after the on-device severe
//               prescreen hits. Confirms severe with the AI; if severe, the post is BLOCKED (never
//               persisted by the caller) and Tier-3 enforcement is applied. Fails OPEN (verdict
//               'allow') if the AI/config is unavailable — the async scan is the backstop.
//   post_scan — asynchronous full scan after a post is live (harassment / inappropriate language /
//               doxxing / borderline threats). Only for the caller's OWN post, judging the text
//               stored for it. If a violation is confirmed, tiered enforcement is applied via the
//               shared, unit-tested engine and the post (with its replies) is removed here.
//
// Enforcement decisions come from _shared/moderation.ts (the SAME source the Jest gate tests), never
// re-derived here. Every action is recorded (moderation_actions) and the user-facing reason is stored
// on the strike (no silent penalties).
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  decideEnforcement,
  restrictionUntil,
  enforcementReason,
  isSelfHarmOnly,
  type ModerationCategory,
  type Severity,
} from '../_shared/moderation.ts';
import { hasCrisisWords } from '../_shared/crisisWords.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const MAX_TEXT = 4000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT;
}

// Self-harm is SUPPORT, never moderation (System 2). Both prompts say so explicitly, and a
// deterministic isSelfHarmOnly() guard runs before the AI is ever called.
const SELF_HARM_RULE =
  'Talking about harming or killing ONESELF (suicidal thoughts, self-harm, "I want to die", ' +
  '"I\'m going to kill myself") is NEVER a threat or any other violation — the person needs support, ' +
  'not moderation. Only threats toward ANOTHER person count as a threat.';

const PRE_POST_SYSTEM =
  'You are a strict safety classifier for a social wellness app. Decide ONLY whether the text is a ' +
  'CLEARLY SEVERE, explicit, DIRECTED threat of violence toward ANOTHER person, or hate speech. ' +
  SELF_HARM_RULE +
  ' Ordinary anger, venting, or hyperbole is NOT severe. Respond with STRICT JSON: {"severe": true|false}.';

const FULL_SCAN_SYSTEM =
  'You moderate a short post shared in a support circle. Classify it. Categories: ' +
  '"inappropriate_language", "harassment", "threat" (toward ANOTHER person), "hate_speech", "doxxing" ' +
  "(sharing ANOTHER person's address, phone number, workplace, or similar identifying info — a real " +
  'NAME alone is NOT doxxing). ' +
  SELF_HARM_RULE +
  ' Severity: "low" | "moderate" | "severe". If it does not violate policy, violation=false. ' +
  'Respond with STRICT JSON: {"violation": true|false, "category": "...", "severity": "low|moderate|severe"}.';

const CATEGORIES = new Set<ModerationCategory>([
  'inappropriate_language',
  'harassment',
  'threat',
  'hate_speech',
  'doxxing',
]);
const SEVERITIES = new Set<Severity>(['low', 'moderate', 'severe']);

type Admin = ReturnType<typeof createClient>;

async function classify(baseUrl: string, apiKey: string, model: string, system: string, text: string) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error('ai_error');
  const data = await res.json().catch(() => null);
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content);
}

/** Apply the tiered consequence + records for a confirmed violation. Pure decision from the engine. */
async function enforce(
  admin: Admin,
  userId: string,
  category: ModerationCategory,
  severity: Severity,
  targetType: string | null,
  targetId: string | null,
  excerpt: string,
  action: string,
): Promise<{ tier: number; reason: string }> {
  const { count } = await admin
    .from('circle_strikes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  const decision = decideEnforcement(count ?? 0, severity);
  const reason = enforcementReason(category, decision);

  const { data: strike } = await admin
    .from('circle_strikes')
    .insert({
      user_id: userId,
      category,
      severity,
      tier: decision.tier,
      target_type: targetType,
      target_id: targetId,
      excerpt,
      reason,
    })
    .select('id')
    .single();

  if (decision.restrictionDays > 0) {
    await admin.from('circle_restrictions').insert({
      user_id: userId,
      strike_id: strike?.id ?? null,
      until: restrictionUntil(new Date().toISOString(), decision.restrictionDays),
      reason,
    });
  }
  if (decision.suspendCircles) {
    await admin.from('circle_suspensions').insert({
      user_id: userId,
      strike_id: strike?.id ?? null,
      status: 'pending_review',
      reason,
    });
  }
  await admin.from('moderation_actions').insert({
    user_id: userId,
    action,
    tier: decision.tier,
    category,
    severity,
    target_type: targetType,
    target_id: targetId,
    reason,
    actor: null, // automated
  });

  return { tier: decision.tier, reason };
}

/**
 * Content takedown for a confirmed post-scan violation, under the service role. The post and its
 * replies disappear for everyone, with no placeholder (client spec 2026-09-29); the strike keeps
 * the offending text and reason for the author's notice. Idempotent: a post that's already gone is
 * skipped. No push: a removal stays silent, like a denied join request (notifications spec).
 * Best-effort: any failure here never affects the scan's own response.
 */
async function removePost(admin: Admin, postId: string): Promise<void> {
  await admin.from('circle_posts').delete().eq('id', postId);
}

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
    const mode = body?.mode === 'post_scan' ? 'post_scan' : body?.mode === 'pre_post' ? 'pre_post' : null;
    const targetType = typeof body?.target_type === 'string' ? body.target_type : null;
    const targetId = typeof body?.target_id === 'string' ? body.target_id : null;
    const isPostTarget = !!targetId && (targetType === 'circle_post' || targetType === 'circle_comment');
    const sentText = typeof body?.text === 'string' ? body.text : '';
    let text = sentText.slice(0, MAX_TEXT).trim();
    if (!mode) return json({ error: 'mode required' }, 400);

    // A scan of a live post only ever acts on the CALLER'S OWN post, and judges the text actually
    // stored for it, never text sent with the request. (Otherwise anyone could send someone else's
    // post id with offensive text and have that post taken down.)
    if (mode === 'post_scan' && isPostTarget) {
      const lookup = createClient(supabaseUrl, serviceKey);
      const { data: post } = await lookup
        .from('circle_posts')
        .select('author_id, body, deleted_at')
        .eq('id', targetId)
        .maybeSingle();
      if (!post || post.deleted_at) return json({ flagged: false, source: 'gone' });
      if (post.author_id !== user.id) return json({ error: 'forbidden' }, 403);
      text = typeof post.body === 'string' ? post.body.slice(0, MAX_TEXT).trim() : '';
      if (!text) return json({ flagged: false, source: 'empty' });
    }
    if (!text) return json({ error: 'text required' }, 400);

    // Self-harm with no violence aimed at anyone else is never moderated (no block, strike,
    // restriction, suspension or removal) — the app shows crisis resources instead.
    if (isSelfHarmOnly(text)) {
      return mode === 'pre_post'
        ? json({ verdict: 'allow', source: 'self_harm_support' })
        : json({ flagged: false, source: 'self_harm_support' });
    }

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';

    if (mode === 'pre_post') {
      // A journal entry with concerning words is never sent to any AI (client 10/14 p.36), and the
      // database refuses to share it. So when an app checks one of the caller's own such entries
      // before sharing it (older builds do), answer without the AI; the share itself is then refused.
      try {
        const lookup = createClient(supabaseUrl, serviceKey);
        const note = sentText.trim();
        if (note && (await hasCrisisWords((fn, args) => lookup.rpc(fn, args), note))) {
          const { count, error } = await lookup
            .from('journal_entries')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('note', note);
          if (error) throw error;
          if ((count ?? 0) > 0) return json({ verdict: 'allow', source: 'crisis_words_entry' });
        }
      } catch {
        return json({ verdict: 'allow', source: 'crisis_check_unavailable' });
      }
      // Fail OPEN: without an AI confirmation we do not block (the async scan is the backstop).
      if (!apiKey) return json({ verdict: 'allow', source: 'unconfigured' });
      let severe = false;
      try {
        severe = (await classify(baseUrl, apiKey, model, PRE_POST_SYSTEM, text))?.severe === true;
      } catch {
        return json({ verdict: 'allow', source: 'ai_error' });
      }
      if (!severe) return json({ verdict: 'allow' });
      const admin = createClient(supabaseUrl, serviceKey);
      const { reason } = await enforce(admin, user.id, 'threat', 'severe', targetType, targetId, text, 'pre_post_blocked');
      return json({ verdict: 'block', reason });
    }

    // post_scan — best-effort; on any failure we simply do not flag.
    if (!apiKey) return json({ flagged: false, source: 'unconfigured' });
    let result: { violation?: boolean; category?: string; severity?: string } | null = null;
    try {
      result = await classify(baseUrl, apiKey, model, FULL_SCAN_SYSTEM, text);
    } catch {
      return json({ flagged: false, source: 'ai_error' });
    }
    if (result?.violation !== true) return json({ flagged: false });

    const category = (CATEGORIES.has(result.category as ModerationCategory)
      ? result.category
      : 'harassment') as ModerationCategory;
    const severity = (SEVERITIES.has(result.severity as Severity)
      ? result.severity
      : 'low') as Severity;

    const admin = createClient(supabaseUrl, serviceKey);
    // Idempotency + fairness: don't strike for a post that's gone by now (deleted while the AI was
    // thinking). This makes the async scan safe to re-run for the same post.
    if (isPostTarget) {
      const { data: existing } = await admin
        .from('circle_posts')
        .select('deleted_at')
        .eq('id', targetId)
        .maybeSingle();
      if (!existing || existing.deleted_at) return json({ flagged: false, source: 'gone' });
    }
    const { tier, reason } = await enforce(admin, user.id, category, severity, targetType, targetId, text, 'content_removed');
    // Take the post down (only Circle-post targets have a row to remove). Best-effort: enforcement
    // is already recorded, so a takedown hiccup must not turn this into a 500.
    if (isPostTarget) {
      try {
        await removePost(admin, targetId!);
      } catch {
        /* takedown is best-effort; the strike/suspension is already durable */
      }
    }
    return json({ flagged: true, tier, category, severity, reason });
  } catch {
    return json({ error: 'error' }, 500);
  }
});
