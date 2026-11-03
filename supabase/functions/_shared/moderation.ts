/**
 * Moderation enforcement engine (System 1 — Circles). PURE and framework-free: no I/O, no Deno or
 * Node APIs, no imports — so the Deno Edge Function (`moderate-circle-content`) is the single caller
 * that turns these decisions into DB writes, while the Jest gate unit-tests the exact same source.
 *
 * The engine never trusts the client: the AI classifier (in the Edge Function) produces a
 * {category, severity}; this maps (prior strike count + severity) → a tier and its consequences,
 * per the ratified design (see design_and_spec). Tier is deterministic and testable so enforcement
 * is auditable and appeals can be reasoned about.
 */

export type ModerationCategory =
  | 'inappropriate_language'
  | 'harassment'
  | 'threat'
  | 'hate_speech'
  | 'doxxing';

export type Severity = 'low' | 'moderate' | 'severe';

export type Tier = 1 | 2 | 3;

export interface EnforcementDecision {
  tier: Tier;
  /** A confirmed violation's content is always removed/hidden. */
  removeContent: boolean;
  /** No silent penalties — the user is always told what & why. */
  warnUser: boolean;
  /** Days the user is blocked from POSTING in Circles (Tier 2 only; 0 otherwise). */
  restrictionDays: number;
  /** Tier 3 only: Circles access suspended indefinitely, pending human review. */
  suspendCircles: boolean;
  /** Every confirmed violation records a strike. */
  recordStrike: boolean;
}

/**
 * Tier-2 posting-restriction length by severity. The spec says "3–5 days depending on severity";
 * this is the default mapping and is intentionally a single named constant so it can be retuned
 * when the client finalizes the exact rule (open question P4). `severe` never reaches Tier 2
 * (severe → Tier 3), but is defined for totality.
 */
export const RESTRICTION_DAYS: Record<Severity, number> = {
  low: 3,
  moderate: 5,
  severe: 5,
};

// Talk of harming ONESELF (System 2 — crisis SUPPORT, never moderation).
const SELF_HARM =
  /\b(?:kill(?:ing)?\s+my\s*self|end(?:ing)?\s+(?:my\s+(?:own\s+)?life|it\s+all)|tak(?:e|ing)\s+my\s+(?:own\s+)?life|hurt(?:ing)?\s+my\s*self|harm(?:ing)?\s+my\s*self|cut(?:ting)?\s+my\s*self|self[-\s]?harm(?:ing)?|suicid(?:e|al)|(?:(?:want|going)\s+to|wanna)\s+die|wish\s+i\s+(?:was|were)\s+dead|better\s+off\s+dead|don['’]?t\s+want\s+to\s+(?:live|be\s+alive|be\s+here|exist))\b/i;

// An explicit act of violence aimed at ANOTHER person ("kill you", "hurt him", "take them with me").
const OTHER_DIRECTED =
  /\b(?:(?:kill(?:s|ed|ing)?|murder(?:s|ed|ing)?|shoot(?:s|ing)?|shot|stab(?:s|bed|bing)?|strangl(?:e|es|ed|ing)|attack(?:s|ed|ing)?|assault(?:s|ed|ing)?|hurt(?:s|ing)?|harm(?:s|ed|ing)?|beat(?:s|ing)?(?:\s+up)?|punch(?:es|ed|ing)?|hit(?:s|ting)?|chok(?:e|es|ed|ing))\s+(?:you|u|him|her|them|y['’]?all|every(?:one|body)|all\s+of\s+you|my\s+(?:ex|boss|manager|neighbou?r|father|mother|dad|mom|brother|sister|wife|husband|partner|co-?worker|teacher|roommate|friend|kids?|son|daughter)|(?:the|that|this)\s+(?:guy|girl|man|woman|person|kid))|tak(?:e|ing)\s+(?:you|them|him|her|every(?:one|body)|y['’]?all)\s+(?:down\s+)?with\s+me)\b/i;

/**
 * True when the text talks about harming ONESELF and contains no explicit violence aimed at another
 * person. Such posts must NEVER be moderated (no strike / restriction / suspension / removal) — the
 * app offers crisis support instead. Deterministic on purpose: the AI classifier once labelled
 * "I'm going to kill myself" a severe *threat* and auto-suspended the author.
 */
export function isSelfHarmOnly(text: string): boolean {
  return SELF_HARM.test(text) && !OTHER_DIRECTED.test(text);
}

/**
 * Whether content must be blocked BEFORE it is posted (never goes live). Reserved for
 * high-confidence, clearly-severe content (explicit, directed threats / hate speech) that the AI
 * has confirmed severe. Ambiguous/lower-confidence content posts normally and is scanned after.
 */
export function isPreBlock(severity: Severity): boolean {
  return severity === 'severe';
}

/**
 * The escalation ladder (pure). `priorStrikes` = strikes already recorded before this offense.
 *   - any single SEVERE offense            → Tier 3
 *   - 3rd offense or beyond (any severity)  → Tier 3
 *   - 2nd offense (any severity)            → Tier 2
 *   - 1st offense, moderate                 → Tier 2
 *   - 1st offense, low                      → Tier 1
 */
export function decideTier(priorStrikes: number, severity: Severity): Tier {
  if (severity === 'severe') return 3;
  const offenseNumber = Math.max(0, Math.floor(priorStrikes)) + 1;
  if (offenseNumber >= 3) return 3;
  if (offenseNumber === 2) return 2;
  return severity === 'moderate' ? 2 : 1;
}

/** The full consequence set for a confirmed violation. */
export function decideEnforcement(priorStrikes: number, severity: Severity): EnforcementDecision {
  const tier = decideTier(priorStrikes, severity);
  return {
    tier,
    removeContent: true,
    warnUser: true,
    restrictionDays: tier === 2 ? RESTRICTION_DAYS[severity] : 0,
    suspendCircles: tier === 3,
    recordStrike: true,
  };
}

/** ISO timestamp `days` after `startIso` (used to set a restriction's `until`). */
export function restrictionUntil(startIso: string, days: number): string {
  return new Date(new Date(startIso).getTime() + days * 86_400_000).toISOString();
}

export type CircleStanding = 'ok' | 'restricted' | 'suspended';

export interface StandingInput {
  /** Any active (pending_review or upheld) Circles suspension. */
  suspended: boolean;
  /** ISO timestamp of the latest active restriction's `until`, or null if none. */
  restrictedUntil: string | null;
}

/**
 * A user's current Circles standing (mirrors the SQL `circle_standing()` used by RLS). A
 * suspension outranks a restriction; a restriction only counts while its `until` is in the future.
 */
export function deriveStanding(input: StandingInput, nowIso: string): CircleStanding {
  if (input.suspended) return 'suspended';
  if (
    input.restrictedUntil &&
    new Date(input.restrictedUntil).getTime() > new Date(nowIso).getTime()
  ) {
    return 'restricted';
  }
  return 'ok';
}

const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  inappropriate_language: 'inappropriate language',
  harassment: 'harassment',
  threat: 'a threat toward another person',
  hate_speech: 'hate speech',
  doxxing: "sharing another person's private information",
};

/**
 * The user-facing explanation for an action — every enforcement must say what triggered it and
 * why (no silent penalties). The Edge Function pairs this with the stored excerpt.
 */
export function enforcementReason(
  category: ModerationCategory,
  decision: EnforcementDecision,
): string {
  const what = `Your Circle post was removed because it contained ${CATEGORY_LABEL[category]}.`;
  if (decision.suspendCircles) {
    return `${what} Your access to Circles is suspended pending review. You still have full access to your journal, check-ins, and reflections. You can appeal this decision.`;
  }
  if (decision.restrictionDays > 0) {
    return `${what} You can't post in Circles for ${decision.restrictionDays} days. You can appeal this decision.`;
  }
  return `${what} This is a warning. No restriction has been applied. You can appeal this decision.`;
}
