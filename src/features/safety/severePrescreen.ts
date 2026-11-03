/**
 * System 1 — on-device prescreen for the PRE-POST block gate (pure + framework-free).
 *
 * The pre-post gate is reserved for HIGH-CONFIDENCE, clearly-severe content: an explicit, directed
 * threat of violence toward a person (e.g. "I'm going to kill you"). It is intentionally STRICTER
 * than System 3's private-threat prescreen — it requires an intent marker AND a violence verb AND a
 * direct target — so legitimate posts are almost never held for a synchronous AI check. Anything it
 * does not catch still posts normally and is caught by the async post-scan; and even a prescreen hit
 * only triggers an AI CONFIRM before a block, never a block on its own.
 */

// Explicit first-person intent ("I'm going to…", "I will…", "gonna…").
const INTENT =
  /\b(?:i['’]?m\s+going\s+to|i\s+am\s+going\s+to|i['’]?m\s+gonna|i\s+will|i['’]ll|going\s+to|gonna|about\s+to)\b/i;

// A violence verb (with common inflections).
const VIOLENCE =
  /\b(?:kill(?:ing|ed|s)?|murder(?:ing|ed|s)?|shoot(?:ing|s)?|shot|stab(?:bing|bed|s)?|strangl(?:e|ing|ed)|attack(?:ing|ed|s)?|assault(?:ing|ed|s)?|hurt(?:ing|s)?|harm(?:ing|ed|s)?|beat(?:ing|en|s)?)\b/i;

// A direct target — including 2nd person, since a Circle post is addressed to other members.
const TARGET =
  /\b(?:you|u|him|her|them|he|she|they|everyone(?:\s+here)?|all\s+of\s+you|y['’]?all)\b/i;

/**
 * True for an explicit, directed threat of violence — the only class blocked before posting. Requires
 * all three of: an intent marker, a violence verb, and a direct target.
 */
export function matchesSeverePrescreen(text?: string | null): boolean {
  if (!text) return false;
  return INTENT.test(text) && VIOLENCE.test(text) && TARGET.test(text);
}
