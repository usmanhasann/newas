// Shared reflection-tone helpers for the AI Edge Functions (Deno). PURE and self-contained
// (no Deno APIs, no imports) so the app's jest suite can import and unit-test it directly —
// this file is the single source of truth for tone resolution + blending.
//
// Users may choose up to TWO personal reflection tones; when a second is present the AI blends
// the two voices. Each function supplies its OWN tone→clause map (the reflection, per-entry, and
// share clauses differ in scale/voice); this module only resolves and blends.

export type Tone = 'gentle' | 'direct' | 'encouraging' | 'reflective';
export const TONES: Tone[] = ['gentle', 'direct', 'encouraging', 'reflective'];

/** A raw (DB) value → a valid Tone, or null. */
export function asTone(v: unknown): Tone | null {
  return typeof v === 'string' && (TONES as string[]).includes(v) ? (v as Tone) : null;
}

/**
 * Primary (+ optional secondary) → an ordered, de-duplicated list of 1–2 tones. Always yields
 * at least one tone: an invalid/absent primary falls back to 'gentle'. A secondary that is
 * invalid or equal to the primary is dropped, so the result is never a redundant self-blend.
 */
export function resolveTones(primary: unknown, secondary?: unknown): Tone[] {
  const p = asTone(primary) ?? 'gentle';
  const s = asTone(secondary);
  return s && s !== p ? [p, s] : [p];
}

/**
 * A single voice instruction from 1–2 tone clauses. One tone → its clause verbatim. Two → an
 * explicit blend that leads with the first voice and lets the second color it throughout
 * (never alternating sentence by sentence). `clauses` is the caller's own tone→clause map.
 */
export function combineVoice(clauses: Record<Tone, string>, tones: Tone[]): string {
  const [a, b] = tones;
  if (!b) return clauses[a];
  return (
    'A blend of TWO voices. Lead with the first and let the second color it throughout, ' +
    'never alternating sentence by sentence:\n' +
    `(1) ${clauses[a]}\n` +
    `(2) ${clauses[b]}`
  );
}
