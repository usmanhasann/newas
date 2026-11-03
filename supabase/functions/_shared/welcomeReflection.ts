// The "Welcome reflection": the first reflection written from a person's onboarding answers, when
// they skip the first check in or their check in had concerning words (client revisions 10/14
// p.33 to p.35, N15). PURE (no I/O, no Deno APIs) so Jest tests the SAME source the
// welcome-reflection Edge Function runs.
//
// The paywall shows ONLY its first sentence ("BASED ON YOUR ANSWERS") and blurs the rest, so the
// first sentence must stand on its own. Everything it says comes from the answers; it never invents.

// Type-only (erased): the app's TypeScript and Jest read this file too, and a value import with a
// .ts extension only works in Deno. The function resolves the picks with tone.ts itself.
import type { Tone } from './tone.ts';

// ---------- the answers (values mirror src/features/onboarding/constants.ts) ----------

const MOTIVATION: Record<string, string> = {
  managing_stress: 'managing stress',
  lifting_low_mood: 'lifting a low mood',
  understanding_myself: 'understanding themselves better',
  building_habit: 'building a daily habit',
  curious: 'simple curiosity',
};

const FREQUENCY: Record<string, string> = {
  rarely: 'rarely',
  sometimes: 'sometimes',
  most_days: 'most days',
  almost_always: 'almost always',
};

const SUPPORT: Record<string, string> = {
  close_friend: 'a close friend',
  family: 'family',
  partner: 'a partner',
  keep_to_myself: 'they tend to keep it to themselves',
  not_sure: 'they are not sure yet',
};

const GOAL: Record<string, string> = {
  calmer: 'feeling calmer',
  patterns: 'noticing their patterns',
  daily_habit: 'a steady daily habit',
  less_alone: 'feeling less alone',
  more_good_days: 'more good days than hard ones',
};

export interface WelcomeAnswers {
  motivation: string[];
  frequency: string | null;
  support: string[];
  goal: string[];
}

/** Up to two known values from a stored answer (an array, or an older build's single string). */
function pick(raw: unknown, known: Record<string, string>): string[] {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out: string[] = [];
  for (const v of list) {
    if (typeof v === 'string' && v in known && !out.includes(v)) out.push(v);
    if (out.length === 2) break;
  }
  return out;
}

/**
 * The answers saved in profiles.settings.onboarding, re-validated: only the known option values
 * (anything else is dropped, so nothing typed or tampered with reaches the AI).
 */
export function readWelcomeAnswers(onboarding: unknown): WelcomeAnswers {
  const o = (onboarding && typeof onboarding === 'object' ? onboarding : {}) as Record<string, unknown>;
  return {
    motivation: pick(o.motivation, MOTIVATION),
    frequency: pick(o.frequency, FREQUENCY)[0] ?? null,
    support: pick(o.support, SUPPORT),
    goal: pick(o.goal, GOAL),
  };
}

export function hasAnyAnswer(a: WelcomeAnswers): boolean {
  return a.motivation.length > 0 || !!a.frequency || a.support.length > 0 || a.goal.length > 0;
}

/**
 * The tone(s) to write in, as [primary, secondary] for tone.ts resolveTones (which validates them
 * and falls back to gentle). While onboarding isn't finished: the tones picked in onboarding (p.33:
 * "using the reflection tone they picked earlier in onboarding"; two are blended). After it: the
 * profile's tone (Edit Profile can change it).
 */
export function welcomeTonePicks(
  profile: {
    onboarding_completed?: boolean | null;
    personal_reflection_style?: unknown;
    personal_reflection_style_secondary?: unknown;
    settings?: unknown;
  } | null,
): [unknown, unknown] {
  if (!profile) return [null, null];
  if (!profile.onboarding_completed) {
    const settings = (
      profile.settings && typeof profile.settings === 'object' ? profile.settings : {}
    ) as { onboarding?: { personal_reflection_style?: unknown } };
    const raw = settings.onboarding?.personal_reflection_style;
    const picked = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).filter(
      (t): t is string => typeof t === 'string',
    );
    if (picked.length) return [picked[0], picked[1] ?? null];
  }
  return [profile.personal_reflection_style, profile.personal_reflection_style_secondary ?? null];
}

// ---------- the prompt ----------

export const WELCOME_TONE_CLAUSE: Record<Tone, string> = {
  gentle:
    'Gentle: soft, warm, and unhurried, leading with empathy. Never push, and offer no comfort their answers did not earn.',
  direct:
    'Direct: plain and concise, no hedging or flourish, while staying human and warm.',
  encouraging:
    'Encouraging: warm and motivating about the step they are taking, without promising results or manufacturing progress.',
  reflective:
    'Reflective: thoughtful and open, noticing what their answers seem to say about what matters to them, without landing on a tidy conclusion.',
};

export const WELCOME_REFLECTION_SYSTEM =
  'You are a warm, perceptive journaling companion. Someone has just started a private journal and ' +
  'answered a few short questions about why they came and what they hope for. You speak directly TO ' +
  'them, always in the second person ("you"), never "I" or "we", like a caring friend who listened ' +
  'closely. You sound like a real person: warm, personal, and natural, never robotic or clinical.';

export function buildWelcomeReflectionPrompt(input: { answers: WelcomeAnswers; toneVoice: string }): string {
  const a = input.answers;
  const list = (values: string[], map: Record<string, string>) =>
    values.length ? values.map((v) => map[v]).join(' and ') : 'not answered';
  return [
    'Write their first reflection, based only on their answers below.',
    '',
    'Rules:',
    'Write 3 to 4 short, complete sentences that read as one warm passage.',
    'The first sentence must stand completely on its own: it is the only sentence they can read before they continue, so make it personal, specific to their answers, and complete.',
    'Everything you say must come from their answers. Never invent events, people, feelings, or reasons they did not give, and never guess why they feel the way they do.',
    'Do not list or recite their answers back, and do not mention questions, answers, an app, or onboarding. Weave what they shared into what it seems to say about what matters to them right now.',
    'If an answer says they keep things to themselves or are not sure who to turn to, hold that gently, without judging it or telling them to reach out.',
    'No advice, no diagnosis, no promises about results, no questions anywhere, no emojis, no greeting, and no sign-off.',
    'Never use dashes of any kind between words or phrases. Use a comma, a period, or "and" instead.',
    'Reply with only the reflection: no preamble, title, labels, or quotation marks.',
    '',
    `Voice: ${input.toneVoice}`,
    '',
    `What brought them here: ${list(a.motivation, MOTIVATION)}`,
    `How often they feel overwhelmed: ${a.frequency ? FREQUENCY[a.frequency] : 'not answered'}`,
    `Who they turn to when things get hard: ${list(a.support, SUPPORT)}`,
    `What would feel like a win a month from now: ${list(a.goal, GOAL)}`,
  ].join('\n');
}

// ---------- when to write it ----------

/** A 'pending' row older than this was left by a call that never finished: write it again. */
export const WELCOME_PENDING_STALE_MS = 90_000;

export type WelcomeDecision = 'ready' | 'deleted' | 'in_progress' | 'generate';

/**
 * What a call does with the existing row. Ready: return it (idempotent). Deleted: the person
 * removed the card, never write it again. Pending and recent: another call is writing it. No row,
 * failed, or a pending row left behind: write it.
 */
export function welcomeDecision(
  row: { status: string; body: string | null; updated_at: string } | null,
  nowMs: number,
): WelcomeDecision {
  if (!row) return 'generate';
  if (row.status === 'deleted') return 'deleted';
  if (row.status === 'ready' && row.body) return 'ready';
  if (row.status === 'pending') {
    const age = nowMs - new Date(row.updated_at).getTime();
    if (Number.isFinite(age) && age < WELCOME_PENDING_STALE_MS) return 'in_progress';
  }
  return 'generate';
}
