/**
 * System 3 — on-device prescreen for a threat of violence toward ANOTHER person, written in a
 * PRIVATE journal/check-in note (pure + framework-free, so it's the single tested source of truth).
 *
 * This is a DIFFERENT keyword set from System 2's crisis matcher: it looks for a violence verb
 * paired with a NON-self target (him / her / them / a named relation), so pure self-harm
 * ("kill myself") does NOT trip it — that belongs to System 2. It is deliberately high-recall and
 * imprecise: its ONLY job is to decide whether to send a possible-hit excerpt to the AI to confirm.
 * The AI (detect-private-threat) is the precision gate; nothing is ever flagged on the prescreen
 * alone, and text that doesn't trip it never leaves the device.
 */

// A violence verb (with common inflections). Boundaries avoid "harmless"/"harmony"/"beautiful".
const VIOLENCE =
  /\b(?:kill(?:ing|ed|s)?|murder(?:ing|ed|s)?|shoot(?:ing|s)?|shot|stab(?:bing|bed|s)?|strangl(?:e|ing|ed)|attack(?:ing|ed|s)?|assault(?:ing|ed|s)?|hurt(?:ing|s)?|harm(?:ing|ed|s)?|beat(?:ing|en|s)?\s+(?:up|him|her|them)|make\s+(?:\w+\s+){1,3}pay|get\s+back\s+at)\b/i;

// A target that is another PERSON (never the writer themselves).
const OTHER_TARGET =
  /\b(?:him|her|them|they|he|she|you|everyone|my\s+(?:ex|boss|manager|neighbou?r|father|mother|dad|mom|brother|sister|wife|husband|partner|co-?worker|teacher|roommate))\b/i;

/**
 * True when the text plausibly threatens violence toward another person — a violence verb AND a
 * non-self target. High recall by design; the AI confirms before anything is ever flagged.
 */
export function matchesPrivateThreatPrescreen(text?: string | null): boolean {
  if (!text) return false;
  return VIOLENCE.test(text) && OTHER_TARGET.test(text);
}
