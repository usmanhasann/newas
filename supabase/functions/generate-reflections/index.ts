// generate-reflections — generates Weekly/Monthly/Yearly AI reflections for
// completed periods (build task §7). Idempotent + static: a period is generated
// once and a READY reflection is NEVER overwritten (so it can't regenerate on
// revisit/restart/new entries/model change). Safe to call from the app (user JWT,
// on opening Insights) or from a scheduled job (service role, per-user).
//
// Server-only: the LLM key never reaches the client. Period math comes from the SQL
// "period service" (get_due_reflection_periods), so the client never computes it.
//
// VOICE: the reflection speaks in the SECOND PERSON, directly TO the writer — a warm
// companion holding up a mirror, telling them what actually happened and how they felt
// during the period and gently linking the two. This is the OPPOSITE of ai-summary, which
// rewrites a single entry in the writer's OWN first-person voice ("I…"). Everything is
// grounded strictly in what they wrote (notes = the only source of events; moods = the only
// source of feelings; never blended, never invented), and a hard period is met plainly, never
// bright-sided — a mental-health surface where being seen matters more than being cheered up.
//
// Deno runtime (Supabase Edge Functions). Not part of the app's TS program.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { type Tone, resolveTones, combineVoice } from '../_shared/tone.ts';
import { withoutClosingQuestion, withoutDashes } from '../_shared/text.ts';
import { orderDuePeriods } from '../_shared/reflectionOrder.ts';
import { flaggedEntryIds, withFlaggedNotesLeftOut, type Rpc } from '../_shared/crisisWords.ts';

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const MAX_PERIODS_PER_CALL = 12; // bound cost/latency; the rest generate on the next call
const PROMPT_VERSION = 5; // v5: never asks a question, no dashes, counts every mood on an entry
const SOURCE_VERSION = 1;
const NOTE_SNIPPET_MAX = 240;
const MAX_NOTES_IN_PROMPT = 30;

interface PeriodStyle {
  word: string;
  sentences: string;
  maxTokens: number;
}

// Period-aware shape: tight for a week, room to breathe for a year. maxTokens sits well above
// the expected length so a reflection never truncates mid-sentence on this sensitive surface.
const PERIOD_STYLE: Record<string, PeriodStyle> = {
  weekly: { word: 'week', sentences: '4 to 6', maxTokens: 400 },
  monthly: { word: 'month', sentences: '6 to 8', maxTokens: 550 },
  yearly: { word: 'year', sentences: '8 to 11', maxTokens: 750 },
};
const DEFAULT_STYLE: PeriodStyle = { word: 'period', sentences: '4 to 6', maxTokens: 400 };

// System prompt for the reflection. {period} is substituted with the period word. Grounding and
// gentleness are made airtight here; the user message carries the period's actual data.
const SYSTEM_TEMPLATE = `You are a warm, perceptive journaling companion. Someone keeps a private journal, and you have just read back over everything they recorded across a single {period}. Now you speak directly TO them, always in the second person ("you"), reflecting their {period} back to them the way a close friend who was genuinely paying attention would: someone who noticed both what happened and how it felt to move through it. You are always the companion speaking to them, never the writer speaking as themselves. Always say "you", never "I" or "we". You are holding up a mirror, not telling a story.

Make them feel truly seen by giving them, in the specifics of their own life:
1. What actually happened: the real moments, people, and places they wrote about, named in their own words (if they wrote "Priya" or "Sunday", say Priya and Sunday).
2. How they felt moving through it: the moods they carried.
3. The gentle line between the two, but only where their own words draw it ("you felt most at home around that table", "the message from Sara sat heavily with you").

The single most important rule: everything you say must come from what they actually wrote. There are two separate sources, and you must never blend them or go beyond them.
Their NOTES are the only source of events, people, places, and reasons. If it is not in a note, then as far as you know it did not happen. Do not mention it, and never invent, guess, embellish, or infer an event, person, place, reason, or outcome, not even a plausible one and not even to help the passage flow.
Their MOODS are the only source of feelings.
Only draw a cause and feeling connection when a single note itself ties the two together; otherwise simply place the feeling and the moment side by side, without implying one caused the other. When they logged a feeling with no note, name that feeling gently and let it rest there. Never supply a reason, a scene, or a "perhaps". Never guess or speculate what an unexplained event ("something serious") might mean or how it turned out; hold it exactly as they wrote it.

If the {period} holds moods but few or no written notes, reflect only the shape of the feelings themselves, honestly and gently. The words behind them went unwritten, so let their shape show through (the outline of the {period}, not the whole story) without inventing the moments, people, or reasons that would fill the rest. Describe the moods by their proportion or dominance ("a happiness ran through more of it than the tiredness"), never by a count.

Sound like a caring person, not a report or a clinician:
Write one flowing, personal passage in short, complete sentences. No lists, no headings, no labels, no clinical or diagnostic language.
Open with something real and particular from their {period}, never a generic line like "What a week". Weave the {period} together rather than marching through it day by day, and never recite their data back to them. Do not count their moods or quote dates.
Stay in the past tense and inside the {period}. No advice, no suggestions, no predictions about what comes next, no greeting, no sign-off, no emojis.
Never ask them a question anywhere in the reflection, and never end on a question. It is a reflection to read, not a conversation to answer.
Never use dashes of any kind between words or phrases (no em dash, en dash, or spaced hyphen). Use a comma, a period, or "and" instead.
Never paper over a hard stretch with hollow positivity, a false silver lining, or an "at least". If the {period} held something hard, meet it plainly and let it stay heavy rather than rushing it toward a fix. Any warmth, hope, or encouragement must be earned by what they actually wrote, never manufactured. A calmer moment that merely came later in the {period} does not resolve an earlier worry; hold the two side by side, never as a tidy before and after. Being truly seen matters more than being cheered up.
Never diagnose or give medical advice. Close simply and honestly on what they actually carried through the {period}, in a way that fits its real weight. No forced uplift, and speak of strength or growth only if their own words show it.

Voice for this reader. Write the whole reflection in this tone: {voiceClause}
This tone shapes how you sound and your pacing, but every grounding and safety rule above is absolute and does not bend for any tone.

Reply with only the reflection itself: no preamble, title, labels, or quotation marks.`;

// User message template: the period's data + the ask. Structural placeholders are filled first
// and the writer's own text (moods, notes) LAST, so nothing in their words is re-interpreted as
// a template token.
const USER_TEMPLATE = `Here is everything the writer recorded during this {period} ({start} to {end}). Speaking directly to them as "you", reflect it back in around {sentences} warm, flowing sentences that read as one passage, telling them what their {period} actually held, how they felt, and, only where their own words support it, how the two connected. Use their real names, places, and moments wherever they gave them, and make sure your final sentence is complete.

Entries they logged: {count}
Moods they recorded (most frequent first): {moodSummary}
What they wrote, in their own words:
{notesBlock}

Before you write, remember: every event, person, place, or reason you name must be something you can point to in the notes above. If it isn't there, don't say it. If a feeling has no note explaining it, name the feeling without supplying a reason; if there are few or no notes, reflect the moods honestly without narrating events that were never written. Open with a real, particular moment (not a generic line), let their lightest and their heaviest moments both be felt, and close by honoring what they carried, gently, without turning it into a lesson or advice, and without a question. {scarcity}`;

// The user's chosen PERSONAL reflection tone(s) (profiles.personal_reflection_style[_secondary]).
// Each clause adjusts only the EXPRESSIVE layer (warmth, pacing, whether questions are welcome);
// the grounding + safety rules in SYSTEM_TEMPLATE stay absolute for every tone. When two tones
// are chosen the clauses are blended into one voice (see combineVoice).
const STYLE_VOICE: Record<Tone, string> = {
  gentle:
    'Gentle: soft, warm, and steady, leading with empathy. Hold their harder moments tenderly and let kindness set the pace; make gentle observations, and never push. Offer no reassurance beyond what their own words earn, and never lighten a hard stretch with comfort they did not write.',
  direct:
    'Direct: clear and concise, getting to the point. Short, plain sentences with no hedging or flourish; say plainly what their {period} held. Stay human and warm, never cold, clinical, or clipped. When something was heavy, let the plainness give it weight rather than rushing past it in a few terse words.',
  encouraging:
    'Encouraging: warm and motivating, alert to genuine growth. Where their OWN words show real effort, steadiness, or a concrete step forward, name that one thing and reflect it back as momentum they can feel. Only where the entries plainly earn it: never manufacture progress, never treat the mere act of logging or a calmer mood later in the period as a step forward, and never chain their moods into a recovery arc (a hard feeling followed by a lighter one is not a resolution). If a stretch was simply hard, or there is little to go on, drop the encouragement entirely and meet it plainly; an unearned lift is worse here than none.',
  reflective:
    'Reflective: thoughtful and open ended. Wonder alongside them and leave room rather than landing on a tidy conclusion, noticing what the {period} seemed to ask of them, without asking them anything. On a hard or notes poor period, stay soft and present, and let a heavy stretch simply be held. Never interrogate, and never imply there is a right answer.',
};

function systemPrompt(word: string, tones: Tone[]): string {
  const voice = combineVoice(STYLE_VOICE, tones);
  // Inject the voice clause FIRST (it may itself contain {period}), then fill {period} everywhere.
  return SYSTEM_TEMPLATE.replace('{voiceClause}', voice).replaceAll('{period}', word);
}

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = env('SUPABASE_URL')!;
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = env('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');

    const admin = createClient(supabaseUrl, serviceKey);
    const rpc: Rpc = (fn, args) => admin.rpc(fn, args);
    const body = await req.json().catch(() => ({}));

    // Identify the target user: a normal call carries the user's JWT; a scheduled
    // call carries the service-role key + an explicit user_id.
    let userId: string | null = null;
    if (bearer && bearer === serviceKey) {
      userId = typeof body?.user_id === 'string' ? body.user_id : null;
      if (!userId) return json({ error: 'user_id required for service calls' }, 400);
    } else {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData.user?.id ?? null;
      if (!userId) return json({ error: 'unauthorized' }, 401);
    }

    // Timezone (for "today") + the user's chosen personal reflection tone(s), in one read.
    const { data: profile } = await admin
      .from('profiles')
      .select('timezone, personal_reflection_style, personal_reflection_style_secondary')
      .eq('user_id', userId)
      .maybeSingle();
    const timeZone = profile?.timezone || 'UTC';
    const personalTones = resolveTones(
      profile?.personal_reflection_style,
      profile?.personal_reflection_style_secondary,
    );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Which completed periods still need a reflection (data-driven + bounded).
    const { data: due, error: dueErr } = await admin.rpc('get_due_reflection_periods', {
      p_today: today,
      p_user: userId,
    });
    if (dueErr) return json({ error: 'due_query_failed', detail: dueErr.message }, 500);

    // Newest first, and each type's newest before anything else: Insights shows the newest finished
    // period of each length and the 9 AM recap push announces it, so it must never wait behind a
    // backlog (client 10/14 p.13-14).
    // Typed as the RPC's rows so each keeps its period_end (the untyped client returns `any`).
    const periods = orderDuePeriods<PeriodRow>(due ?? [], MAX_PERIODS_PER_CALL);

    const baseUrl = env('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    const apiKey = env('AI_API_KEY');
    const model = env('AI_MODEL') ?? 'openai/gpt-4o-mini';

    const results: { type: string; period_start: string; status: string }[] = [];

    for (const p of periods) {
      // Claim the period (idempotent): create a pending row if none exists.
      await admin
        .from('reflections')
        .insert({
          user_id: userId,
          type: p.type,
          period_start: p.period_start,
          period_end: p.period_end,
          status: 'pending',
          source_version: SOURCE_VERSION,
          prompt_version: PROMPT_VERSION,
        })
        .select('id')
        .maybeSingle(); // unique violation → row already exists; ignore.

      // If a READY reflection already exists, leave it untouched (static).
      const { data: existing } = await admin
        .from('reflections')
        .select('id, status')
        .eq('user_id', userId)
        .eq('type', p.type)
        .eq('period_start', p.period_start)
        .maybeSingle();
      if (existing?.status === 'ready') {
        results.push({ type: p.type, period_start: p.period_start, status: 'ready' });
        continue;
      }

      // Source data for the completed period (snapshot). If it can't be read, nothing is written
      // (a reflection of nothing would otherwise be saved as ready, and never redone).
      const { data: entries, error: entriesErr } = await admin
        .from('journal_entries')
        .select('id, mood_slug, mood_slugs, note, local_date, crisis_flagged')
        .eq('user_id', userId)
        .gte('local_date', p.period_start)
        .lte('local_date', p.period_end)
        .order('local_date', { ascending: true });
      if (entriesErr) {
        await markFailed(admin, userId, p, 'entries unavailable');
        results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
        continue;
      }

      const sourceIds = (entries ?? []).map((r) => r.id);
      // Concerning words come first (client 10/14 p.36): an entry with a crisis keyword still counts,
      // with its moods, but its words are left out of the prompt so they never reach the AI.
      // Re-checked against the keyword list right now; if that can't answer, nothing is sent.
      let rows: EntryRow[];
      try {
        rows = withFlaggedNotesLeftOut(entries ?? [], await flaggedEntryIds(rpc, sourceIds));
      } catch {
        await markFailed(admin, userId, p, 'crisis check unavailable');
        results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
        continue;
      }

      if (!apiKey) {
        await markFailed(admin, userId, p, 'AI not configured');
        results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
        continue;
      }

      const style = PERIOD_STYLE[p.type] ?? DEFAULT_STYLE;
      const prompt = buildPrompt(style, p.period_start, p.period_end, rows);

      try {
        const aiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt(style.word, personalTones) },
              { role: 'user', content: prompt },
            ],
            max_tokens: style.maxTokens,
            temperature: 0.7,
          }),
        });

        if (!aiRes.ok) {
          await markFailed(admin, userId, p, `LLM ${aiRes.status}`);
          results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
          continue;
        }

        const aiJson = await aiRes.json();
        const raw: string | null = aiJson?.choices?.[0]?.message?.content?.trim() ?? null;
        // House rules the model can still slip on: no dashes, never a closing question.
        const content = raw ? withoutClosingQuestion(withoutDashes(raw)) : null;
        if (!content) {
          await markFailed(admin, userId, p, 'empty completion');
          results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
          continue;
        }

        // Persist — but NEVER clobber a row that became ready concurrently (static).
        await admin
          .from('reflections')
          .update({
            status: 'ready',
            content,
            entry_count: rows.length,
            source_entry_ids: sourceIds,
            source_version: SOURCE_VERSION,
            model,
            prompt_version: PROMPT_VERSION,
            error: null,
            generated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('type', p.type)
          .eq('period_start', p.period_start)
          .neq('status', 'ready');

        results.push({ type: p.type, period_start: p.period_start, status: 'ready' });
      } catch (e) {
        await markFailed(admin, userId, p, String(e).slice(0, 200));
        results.push({ type: p.type, period_start: p.period_start, status: 'failed' });
      }
    }

    return json({ generated: results.length, results });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});

interface PeriodRow {
  type: string;
  period_start: string;
  period_end: string;
}
interface EntryRow {
  id: string;
  mood_slug: string;
  mood_slugs: string[] | null;
  note: string | null;
  local_date: string;
  crisis_flagged?: boolean | null;
}

function buildPrompt(
  style: PeriodStyle,
  start: string,
  end: string,
  rows: EntryRow[],
): string {
  const moodCounts: Record<string, number> = {};
  for (const r of rows) {
    const moods = r.mood_slugs && r.mood_slugs.length ? r.mood_slugs : [r.mood_slug];
    for (const m of moods) moodCounts[m] = (moodCounts[m] ?? 0) + 1;
  }
  const moodSummary =
    Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([m, c]) => `${m.replace(/_/g, ' ')} x${c}`)
      .join(', ') || 'none logged';

  const noteRows = rows.filter((r) => r.note && r.note.trim().length > 0);
  const notesBlock = noteRows.length
    ? noteRows
        .slice(0, MAX_NOTES_IN_PROMPT)
        .map((r) => `(${r.local_date}) ${r.note!.trim().slice(0, NOTE_SNIPPET_MAX)}`)
        .join('\n')
    : '(no notes were written this period, only moods were logged)';

  // Clamp hard when there's little to go on — a single entry, OR moods with no written notes —
  // so the model stays short and cannot be pushed to narrate events that were never written.
  const sparse = rows.length <= 1 || noteRows.length === 0;
  const sentences = sparse ? '2 to 3' : style.sentences;
  const scarcity = sparse
    ? `There is very little to go on here${
        noteRows.length === 0 ? ', only moods were logged and no notes were written' : ''
      }, so keep it short and gentle, reflect only the feelings, and never invent or over-interpret.`
    : '';

  // Fill structural placeholders first, then the writer's own text (moods, notes) LAST, so
  // nothing in their words is re-interpreted as a template token.
  return USER_TEMPLATE.replaceAll('{period}', style.word)
    .replace('{start}', start)
    .replace('{end}', end)
    .replace('{count}', String(rows.length))
    .replace('{sentences}', sentences)
    .replace('{scarcity}', scarcity)
    .replace('{moodSummary}', moodSummary)
    .replace('{notesBlock}', notesBlock);
}

// deno-lint-ignore no-explicit-any
async function markFailed(admin: any, userId: string, p: PeriodRow, msg: string) {
  await admin
    .from('reflections')
    .update({ status: 'failed', error: msg })
    .eq('user_id', userId)
    .eq('type', p.type)
    .eq('period_start', p.period_start)
    .neq('status', 'ready');
}
