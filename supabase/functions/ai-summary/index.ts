// ai-summary: the AI Insight on a journal entry, a short first-person reflection in the writer's
// own voice (shown on the entry, and in a circle when they share the reflection). It adds the layer
// underneath what they wrote (feeling, tone, meaning) rather than retelling it, and it can see the
// writer's recent entries so it notices when today continues something from before. The prompt
// lives in _shared/entryReflection.ts (unit-tested).
// Provider-agnostic OpenAI-compatible call (AI_BASE_URL / AI_API_KEY / AI_MODEL),
// so it works with OpenRouter (routing to an OpenAI model) or OpenAI directly.
// Server-only: the API key never reaches the client. Validates ownership,
// rate-limits per user, is idempotent, and persists ai_summary + ai_status.
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { resolveTones, combineVoice } from '../_shared/tone.ts';
import {
  ENTRY_REFLECTION_SYSTEM,
  ENTRY_TONE_CLAUSE,
  MEMORY_DAYS,
  MEMORY_ENTRIES,
  buildEntryReflectionPrompt,
  localDateMinusDays,
  type EarlierEntry,
} from '../_shared/entryReflection.ts';
import { withoutClosingQuestion, withoutDashes } from '../_shared/text.ts';
import {
  flaggedEntryIds,
  isCrisisFlagged,
  withoutFlaggedEntries,
  type Rpc,
} from '../_shared/crisisWords.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const RATE_LIMIT = 5; // summaries per user per minute

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { entry_id: entryId } = await req.json().catch(() => ({}));
    if (!entryId) return json({ error: 'entry_id required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Ownership check.
    const { data: entry, error: ee } = await admin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .single();
    if (ee || !entry) return json({ error: 'not_found' }, 404);
    if (entry.user_id !== user.id) return json({ error: 'forbidden' }, 403);

    // Nothing to summarize.
    if (!entry.note || entry.note.trim().length === 0) {
      await admin
        .from('journal_entries')
        .update({ ai_status: 'ready', ai_summary: null })
        .eq('id', entryId);
      return json({ status: 'ready', summary: null });
    }

    // Concerning words come first (client 10/14 p.36): an entry with a crisis keyword gets no AI
    // reflection and its text is never sent. Re-checked against the keyword list right now, and if
    // the check can't answer, nothing is sent (fails closed).
    const rpc: Rpc = (fn, args) => admin.rpc(fn, args);
    let flagged: Set<string>;
    try {
      flagged = await flaggedEntryIds(rpc, [entryId]);
    } catch {
      await markFailed(admin, entryId, 'crisis check unavailable');
      return json({ error: 'crisis_check_unavailable' }, 503);
    }
    if (isCrisisFlagged(entry, flagged)) {
      // Saving it again lets the database flag it (and take it out of any circle) when the keyword
      // list changed after it was written. No reflection is kept on it either way.
      await admin
        .from('journal_entries')
        .update({ ai_status: 'ready', ai_summary: null, ai_error: null })
        .eq('id', entryId);
      return json({ status: 'ready', summary: null, flagged: true });
    }

    // Idempotent: already summarized.
    if (entry.ai_status === 'ready' && entry.ai_summary) {
      await announceReflectionShares(admin, supabaseUrl, anonKey, authHeader, entryId);
      return json({ status: 'ready', summary: entry.ai_summary });
    }

    // Per-user rate limit on new generations (reuses audit_log; no extra table).
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('actor_id', user.id)
      .eq('action', 'ai.summary')
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_LIMIT) return json({ error: 'rate_limited' }, 429);

    await admin
      .from('journal_entries')
      .update({ ai_status: 'pending', ai_error: null })
      .eq('id', entryId);

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';

    if (!apiKey) {
      await markFailed(admin, entryId, 'AI not configured');
      return json({ error: 'ai_not_configured' }, 500);
    }

    // The writer's chosen reflection tone(s) shape their AI Insight too (blended when two).
    const { data: prof } = await admin
      .from('profiles')
      .select('personal_reflection_style, personal_reflection_style_secondary')
      .eq('user_id', user.id)
      .maybeSingle();
    const toneVoice = combineVoice(
      ENTRY_TONE_CLAUSE,
      resolveTones(prof?.personal_reflection_style, prof?.personal_reflection_style_secondary),
    );

    // Every mood on the entry (up to 3), by name.
    const { data: moodRows } = await admin.from('moods').select('slug, label');
    const labelOf = new Map(
      (moodRows ?? []).map((m: { slug: string; label: string }) => [m.slug, m.label]),
    );
    const moodNames = (slugs: string[] | null, first: string | null): string[] =>
      (slugs && slugs.length ? slugs : first ? [first] : []).map((m) => labelOf.get(m) ?? m);

    // Memory: the writer's previous entries from the last two weeks (their own words only). An
    // entry with concerning words is never part of it; if that can't be checked, there's no memory.
    const { data: earlierRows } = await admin
      .from('journal_entries')
      .select('id, local_date, note, mood_slug, mood_slugs, crisis_flagged')
      .eq('user_id', user.id)
      .neq('id', entryId)
      .eq('crisis_flagged', false)
      .lt('created_at', entry.created_at)
      .gte('local_date', localDateMinusDays(entry.local_date, MEMORY_DAYS))
      .not('note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MEMORY_ENTRIES);
    interface MemoryRow {
      id: string;
      local_date: string;
      note: string | null;
      mood_slug: string | null;
      mood_slugs: string[] | null;
      crisis_flagged?: boolean | null;
    }
    let memoryRows: MemoryRow[] = [];
    try {
      const rows: MemoryRow[] = earlierRows ?? [];
      memoryRows = withoutFlaggedEntries(rows, await flaggedEntryIds(rpc, rows.map((e) => e.id)));
    } catch {
      memoryRows = [];
    }
    const earlier: EarlierEntry[] = memoryRows.flatMap((e) =>
      e.note && e.note.trim().length > 0
        ? [{ date: e.local_date, moods: moodNames(e.mood_slugs, e.mood_slug), note: e.note }]
        : [],
    );

    const prompt = buildEntryReflectionPrompt({
      note: entry.note,
      moods: moodNames(entry.mood_slugs, entry.mood_slug),
      toneVoice,
      earlier,
    });

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ENTRY_REFLECTION_SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 220,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const detail = (await aiRes.text()).slice(0, 200);
      await markFailed(admin, entryId, `LLM ${aiRes.status}`);
      return json({ error: 'llm_error', detail }, 502);
    }

    const aiJson = await aiRes.json();
    const raw: string | null = aiJson?.choices?.[0]?.message?.content?.trim() ?? null;
    // House rules the model can still slip on: no dashes, and it never ends on a question.
    const summary = raw ? withoutClosingQuestion(withoutDashes(raw)) : null;
    if (!summary) {
      await markFailed(admin, entryId, 'empty completion');
      return json({ error: 'empty_completion' }, 502);
    }

    await admin
      .from('journal_entries')
      .update({ ai_summary: summary, ai_status: 'ready', ai_error: null })
      .eq('id', entryId);
    await admin.from('audit_log').insert({
      actor_id: user.id,
      action: 'ai.summary',
      entity_type: 'journal_entry',
      entity_id: entryId,
    });
    // A share of this reflection just became visible to its circle: announce it now, so it never
    // depends on the app staying open.
    await announceReflectionShares(admin, supabaseUrl, anonKey, authHeader, entryId);

    return json({ status: 'ready', summary });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});

/**
 * If this entry is shared into a circle as its AI reflection, ask send-push (as the author) to tell
 * the circle. send-push announces each entry once per circle, so repeats are harmless. Best-effort.
 */
async function announceReflectionShares(
  // deno-lint-ignore no-explicit-any
  admin: any,
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  entryId: string,
): Promise<void> {
  try {
    const { count } = await admin
      .from('circle_posts')
      .select('id', { count: 'exact', head: true })
      .eq('entry_id', entryId)
      .eq('entry_version', 'reflection');
    if (!count) return;
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: anonKey },
      body: JSON.stringify({ type: 'share_created', entry_id: entryId }),
    });
  } catch {
    /* best-effort: the app also announces after asking for the reflection */
  }
}

// deno-lint-ignore no-explicit-any
async function markFailed(admin: any, entryId: string, msg: string) {
  await admin
    .from('journal_entries')
    .update({ ai_status: 'failed', ai_error: msg })
    .eq('id', entryId);
}
