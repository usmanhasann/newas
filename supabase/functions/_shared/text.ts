// Plain-text clean-up for AI-written text (client rules, 2026-09-29). No I/O / no Deno APIs — the
// edge functions and the Jest test share this source. The app has an identical copy for text that
// was stored before these rules (src/utils/text.ts); a test keeps the two in step.

/**
 * No dash punctuation anywhere in the app: em/en/figure dashes, horizontal bars, double hyphens and
 * spaced hyphens become plain punctuation (a range becomes "15 to 60" or "Sep 7 to Sep 13").
 * Hyphenated words like "check-in" are left alone.
 */
export function withoutDashes(text: string): string {
  return text
    .replace(/(\d)\s*(?:[‒–—―]|-{2,})\s*(\d)/g, '$1 to $2')
    .replace(/(\d)\s*(?:[‒–—―]|-{2,})\s*(?=[A-Z][a-z]{2,8}\.? \d)/g, '$1 to ')
    .replace(/\s*(?:[‒–—―]+|-{2,})\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*([.,!?;:])/g, '$1')
    .replace(/^\s*,\s*/, '')
    .replace(/,\s*$/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Reflections never end on a question: drop trailing question sentence(s), as long as something
 * else remains. The rest of the text is kept exactly as written (quotes, paragraph breaks).
 */
export function withoutClosingQuestion(text: string): string {
  let kept = text.trim();
  while (/\?["'”’)\]]*$/.test(kept)) {
    // Where the last sentence starts: after the last end mark (with any closing quote or bracket)
    // that's followed by whitespace. None → it's the only sentence, so it stays.
    const boundary = [...kept.matchAll(/[.!?…]["'”’)\]]*(?=\s)/g)].pop();
    if (!boundary || boundary.index === undefined) break;
    kept = kept.slice(0, boundary.index + boundary[0].length);
  }
  return kept;
}
