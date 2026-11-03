/**
 * Warm, plain-spoken copy generators for the onboarding flow. Pure functions so the
 * personalization (and its grammar) is unit-testable. We NEVER surface raw enum
 * values — every value maps to a natural phrase, with safe fallbacks if missing.
 */
import {
  REFLECTION_STYLES,
  type FrequencyValue,
  type GoalValue,
  type MotivationValue,
  type ReflectionStyleValue,
  type SupportValue,
} from './constants';

/**
 * The "real" questions are multi-select (up to 2), so answers arrive as arrays. Personalized
 * onboarding copy reads most naturally with a SINGLE value, so we use the PRIMARY (first)
 * selection here — the full set is still stored and, for reflection tone, fully used by the AI.
 * Also tolerates a bare scalar (an interrupted flow persisted before the multi-select change).
 */
function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Reads naturally in "You're navigating ___". */
const STRESS_PHRASE: Record<FrequencyValue, string> = {
  rarely: 'occasional stress',
  sometimes: 'stress that comes and goes',
  most_days: 'stress most days',
  almost_always: 'near-constant stress',
};

/** Reads naturally in "you'd love to ___". */
const GOAL_ASPIRATION: Record<GoalValue, string> = {
  calmer: 'feel calmer',
  patterns: 'notice your patterns',
  daily_habit: 'build a steady daily habit',
  less_alone: 'feel less alone',
  more_good_days: 'have more good days than hard ones',
};

export function stressPhrase(freq: FrequencyValue | FrequencyValue[] | null | undefined): string {
  const f = first(freq);
  return (f && STRESS_PHRASE[f]) || 'stress';
}

/**
 * The "Right now" card on "The shift you're working toward": how the person feels today, as a state
 * (client 10/14 p.11: "Stressed most days", not the noun "Stress most days").
 */
const STRESS_STATE: Record<FrequencyValue, string> = {
  rarely: 'Occasionally stressed',
  sometimes: 'Stressed now and then',
  most_days: 'Stressed most days',
  almost_always: 'Stressed almost all the time',
};
export function stressStateLabel(freq: FrequencyValue | FrequencyValue[] | null | undefined): string {
  const f = first(freq);
  return (f && STRESS_STATE[f]) || 'Feeling stressed';
}

/**
 * The "With LYSM" card under it: where they're heading, in the same form as "Right now"
 * ("Feeling calmer", not the instruction "Feel calmer").
 */
const GOAL_OUTCOME: Record<GoalValue, string> = {
  calmer: 'Feeling calmer',
  patterns: 'Noticing your patterns',
  daily_habit: 'Building a steady daily habit',
  less_alone: 'Feeling less alone',
  more_good_days: 'Having more good days than hard ones',
};
export function goalOutcomeLabel(goal: GoalValue | GoalValue[] | null | undefined): string {
  const g = first(goal);
  return (g && GOAL_OUTCOME[g]) || 'Feeling more like yourself';
}

export function goalAspiration(goal: GoalValue | GoalValue[] | null | undefined): string {
  const g = first(goal);
  return (g && GOAL_ASPIRATION[g]) || 'feel more like yourself';
}

// ---------------------------------------------------------------------------
// Personalized "building your plan" checklist copy (§10/§11). Pure so the
// BuildingStep recap is driven by the user's REAL answers, not static filler.
// ---------------------------------------------------------------------------

/**
 * Frequency ("how often do you feel overwhelmed") → a plan row. Phrased around OVERWHELM, NOT
 * "stress" — so it never echoes a stress-based motivation row like "Focusing on managing stress"
 * (the plan recap would otherwise repeat "stress" twice). "Overwhelm" is the verb, as in the
 * question (client 10/14 p.12: "Steadying the days that overwhelm you most").
 */
const OVERWHELM_PLAN_LABEL: Record<FrequencyValue, string> = {
  rarely: 'Steadying the rare days that overwhelm you',
  sometimes: 'Steadying the days that overwhelm you now and then',
  most_days: 'Steadying the days that overwhelm you most',
  almost_always: 'Steadying the days that so often overwhelm you',
};
export function overwhelmPlanLabel(
  freq: FrequencyValue | FrequencyValue[] | null | undefined,
): string {
  const f = first(freq);
  return (f && OVERWHELM_PLAN_LABEL[f]) || 'Steadying the days that feel heavy';
}

/**
 * "Who do you turn to" → a plan row that honors the answer, including the choice to
 * keep things private. Full labels (not phrase-insertion) so every value reads naturally.
 */
export function supportPlanLabel(
  support: SupportValue | SupportValue[] | null | undefined,
): string {
  switch (first(support)) {
    case 'close_friend':
      return 'Keeping the friend you lean on close';
    case 'family':
      return 'Keeping the family you lean on close';
    case 'partner':
      return 'Keeping the partner you lean on close';
    case 'keep_to_myself':
      return 'A private space that’s just for you';
    case 'not_sure':
      return 'A private space, with room to reach out when you’re ready';
    default:
      return 'Room for the people you trust';
  }
}

/** Labels sourced from the single REFLECTION_STYLES definition so they never drift. */
const REFLECTION_STYLE_LABEL = Object.fromEntries(
  REFLECTION_STYLES.map((o) => [o.value, o.label]),
) as Record<ReflectionStyleValue, string>;

/**
 * The reflection tone(s) the user chose, as words in a sentence: "gentle" or "gentle and direct"
 * (up to two), for "Tuning your reflections to sound ___" (client 10/14 p.11-12: an option label
 * dropped into a sentence must take the sentence's form, so no capitals and no "&"). Falls back to
 * the DB default (gentle) when none is set, so the row is never empty.
 */
export function reflectionStylePhrase(
  styles: ReflectionStyleValue | ReflectionStyleValue[] | null | undefined,
): string {
  const arr = Array.isArray(styles) ? styles : styles ? [styles] : [];
  const words = arr
    .slice(0, 2)
    .map((v) => REFLECTION_STYLE_LABEL[v]?.toLowerCase())
    .filter(Boolean);
  return words.length ? words.join(' and ') : REFLECTION_STYLE_LABEL.gentle.toLowerCase();
}

/** Life-stage phrase from an age in whole years (from the birthday step), e.g. "your 30s". */
export function lifeStageLabel(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age) || age < 0) return 'your stage of life';
  if (age < 20) return 'your late teens';
  const decade = Math.floor(age / 10) * 10;
  return `your ${decade}s`;
}

/** "Have you tried other apps" → a plan row (true = build on it, false = fresh start). */
export function triedAppsPlanLabel(tried: boolean | null | undefined): string {
  if (tried === true) return 'Building on what you’ve tried before';
  if (tried === false) return 'A fresh start, built around you';
  return 'A journaling habit that fits you';
}

/**
 * Fixed, pre-written reflect-back clause for each "who do you turn to when things get hard"
 * answer. Intentionally NOT dynamically composed — one exact sentence per support option.
 */
const SUPPORT_REFLECTION: Record<SupportValue, string> = {
  close_friend:
    'You lean on a close friend when things get hard. LYSM can be another layer of support alongside that.',
  family:
    'You lean on family when things get hard. LYSM can be another layer of support alongside that.',
  partner:
    'You lean on a partner when things get hard. LYSM can be another layer of support alongside that.',
  keep_to_myself:
    "You said you tend to keep things to yourself, and that's exactly what this space is for.",
  not_sure:
    "You're still figuring out who you turn to. That's okay too, and this space can help either way.",
};

/**
 * Screen 7 reflect-back ("Thanks for sharing"). The overwhelm + goal parts are inserted
 * grammatically from the user's answers (they vary per user); the support part is a FIXED
 * pre-written clause chosen by the "who do you turn to" answer. e.g. "Thanks for sharing.
 * You're navigating stress that comes and goes and you'd love to feel calmer. LYSM is built
 * for exactly this — small daily check-ins that help you see what's really going on. You lean
 * on a close friend when things get hard. LYSM can be another layer of support alongside that."
 */
export function reflectBack(
  freq: FrequencyValue | FrequencyValue[] | null | undefined,
  goal: GoalValue | GoalValue[] | null | undefined,
  support?: SupportValue | SupportValue[] | null,
): string {
  const opener =
    `Thanks for sharing. You're navigating ${stressPhrase(freq)} and you'd love to ` +
    `${goalAspiration(goal)}. LYSM is built for exactly this: small daily ` +
    `check-ins that help you see what's really going on.`;
  // The support clause uses the PRIMARY answer; omitted only if somehow absent (it's required).
  const s = first(support);
  const supportClause = s ? SUPPORT_REFLECTION[s] : '';
  return supportClause ? `${opener} ${supportClause}` : opener;
}

/**
 * When the trial reminder fires: 2 days before the trial ends (uses the server's end time). That's
 * the "Day 3" the paywall's timeline promises for the 5-day trial (Today, Day 3, Day 5).
 */
export function trialReminderFireAt(trialEndsAtMs: number): number {
  return trialEndsAtMs - 2 * 24 * 60 * 60 * 1000;
}

/**
 * The Day 3 trial reminder push. The title is the client's exact sentence (client 10/14 p.36:
 * "Your free trial ends in 2 days."); the body keeps the renewal date, amount, and how to cancel,
 * so the renewal terms stay clear (App Store rule). `renewalDateLabel` is a human date string
 * and `priceLabel` is e.g. "$29.99/year".
 */
export function trialReminderMessage(opts: {
  priceLabel: string;
  renewalDateLabel: string;
}): { title: string; body: string } {
  return {
    title: 'Your free trial ends in 2 days.',
    body:
      `Your plan renews on ${opts.renewalDateLabel} at ${opts.priceLabel} unless you cancel. ` +
      'You can cancel anytime in Profile → Subscription.',
  };
}

// ---------------------------------------------------------------------------
// Value graph (§7) copy.
// ---------------------------------------------------------------------------

const MOTIVATION_FOCUS: Record<MotivationValue, string> = {
  managing_stress: 'managing stress',
  lifting_low_mood: 'lifting your mood',
  understanding_myself: 'understanding yourself',
  building_habit: 'building a journaling habit',
  curious: 'exploring how you feel',
};

export function motivationFocus(m: MotivationValue | MotivationValue[] | null | undefined): string {
  const mm = first(m);
  return (mm && MOTIVATION_FOCUS[mm]) || 'your wellbeing';
}

export interface ValueGraphCopy {
  title: string;
  subtitle: string;
  withLabel: string;
  withoutLabel: string;
  caption: string;
}

/**
 * Value/improvement graph copy (spec §7). The graph now appears BEFORE the quiz questions
 * (so the user's motivation isn't known yet), so the copy is fixed rather than personalized.
 * MOTIVATIONAL, illustrative language only — never a medical/psychological or guaranteed
 * outcome claim.
 */
export function valueGraphCopy(): ValueGraphCopy {
  return {
    title: 'Steadier days, one check-in at a time',
    subtitle: 'Consistency is what moves the needle. Small daily check-ins add up.',
    withLabel: 'With LYSM',
    withoutLabel: 'Without LYSM',
    caption: 'An illustration of steady vs. on-and-off check-ins, not a guarantee.',
  };
}
