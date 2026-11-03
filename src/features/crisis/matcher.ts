/**
 * Crisis phrase matcher (pure + unit-tested). Conservative by design: scans entry
 * text against the keyword list and returns the HIGHEST-severity match (or null).
 * Mirrors the database's crisis_words_match (migration 20261022120000), which flags entries on save,
 * so the phone and the server agree.
 *
 * 'contains' and 'word' look in the text as typed (lower case) AND in a normalized form: apostrophes
 * dropped ("don't", "don’t" and "dont" all read "dont"; iPhone types the curly one) and runs of
 * spaces and dashes read as one space ("self-harm" reads "self harm"). Normalizing only ever adds
 * matches. 'regex' runs the raw pattern on the raw text.
 */
import type { CrisisKeyword } from '@app-types/database';

const SEVERITY_RANK: Record<CrisisKeyword['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The normalized form both sides compare (see above). */
export function normalizeCrisisText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['`´‘’ʼ]/g, '')
    .replace(/[\s‐‑‒–—―-]+/g, ' ')
    .trim();
}

function has(hay: string, phrase: string, wholeWords: boolean): boolean {
  if (!phrase) return false;
  return wholeWords ? new RegExp(`\\b${escapeRegex(phrase)}\\b`).test(hay) : hay.includes(phrase);
}

export function detectCrisis(
  text: string | null | undefined,
  keywords: CrisisKeyword[],
): CrisisKeyword | null {
  if (!text) return null;
  const raw = text.toLowerCase();
  const hay = normalizeCrisisText(text);
  let best: CrisisKeyword | null = null;

  for (const k of keywords) {
    if (!k.is_active) continue;
    let matched = false;

    if (k.match_type === 'regex') {
      try {
        matched = new RegExp(k.phrase, 'i').test(text);
      } catch {
        matched = false;
      }
    } else {
      const words = k.match_type === 'word';
      matched =
        has(raw, k.phrase.toLowerCase(), words) ||
        has(hay, normalizeCrisisText(k.phrase), words);
    }

    if (matched && (!best || SEVERITY_RANK[k.severity] > SEVERITY_RANK[best.severity])) {
      best = k;
    }
  }

  return best;
}
