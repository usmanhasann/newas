/**
 * Per-entry mood selection (overhaul spec §1.2/§1.3). Pure + framework-free so it's
 * the single source of truth for every entry mood picker and stays unit-testable.
 *
 * Rule: each journal ENTRY may hold up to 3 distinct moods. There is NO per-user and
 * NO per-day limit, and no cap on entries per day. Replacing a mood (remove one, add
 * another) nets zero against the cap, so "Two mood slots remaining" stays "Two mood
 * slots remaining" after a swap (§1.3). The server re-asserts dedupe + the cap in the
 * normalize_entry_moods trigger.
 */
import { MOOD_KEYS, type MoodKey } from '@theme/moods';

export const ENTRY_MOOD_LIMIT = 3;

/** Toggle a mood for the entry: remove it if selected, else add it (unless at cap). */
export function toggleEntryMood(
  selected: readonly MoodKey[],
  mood: MoodKey,
  max: number = ENTRY_MOOD_LIMIT,
): MoodKey[] {
  if (selected.includes(mood)) return selected.filter((m) => m !== mood);
  if (selected.length >= max) return [...selected]; // full — caller may message
  return [...selected, mood];
}

/** Slots still available for this entry (0..max). */
export function entryMoodSlotsRemaining(
  selected: readonly unknown[],
  max: number = ENTRY_MOOD_LIMIT,
): number {
  return Math.max(0, max - selected.length);
}

export function isEntryMoodLimitReached(
  selected: readonly unknown[],
  max: number = ENTRY_MOOD_LIMIT,
): boolean {
  return selected.length >= max;
}

/**
 * Moods to disable in a multi-select picker: none while slots remain; once full, every
 * UNSELECTED mood is disabled while SELECTED ones stay tappable, so the user can always
 * remove/replace and is never stuck (§1.3).
 */
export function disabledEntryMoodKeys(
  selected: readonly MoodKey[],
  max: number = ENTRY_MOOD_LIMIT,
): MoodKey[] {
  if (selected.length < max) return [];
  return MOOD_KEYS.filter((k) => !selected.includes(k));
}

const NUMBER_WORD: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three' };

/**
 * Picker caption using the spec's exact wording, e.g. "Two mood slots remaining"
 * (§1.3). At the cap it invites a swap instead of showing "0 slots".
 */
export function moodSlotsLabel(selectedCount: number, max: number = ENTRY_MOOD_LIMIT): string {
  const remaining = Math.max(0, max - selectedCount);
  if (remaining === 0) return `You’ve picked ${max} moods. Tap one to swap it.`;
  const word = NUMBER_WORD[remaining] ?? String(remaining);
  const noun = remaining === 1 ? 'mood slot' : 'mood slots';
  return `${word} ${noun} remaining`;
}
