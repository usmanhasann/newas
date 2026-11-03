/**
 * "Today's Mood" ordering for the Home card (spec §3 highlight behavior).
 *
 * When the user saves an entry with moods, those moods move to the LEFT of the Today's Mood row and
 * show as selected. Details, pure + framework-free so they're the single tested source of truth:
 *  - Accumulate ACROSS every entry saved today (not just the latest).
 *  - Order the highlighted moods by the exact moment each was FIRST selected — earliest tap
 *    furthest left. Within an entry the mood array is already in tap order (see toggleEntryMood);
 *    across entries the caller passes them oldest-first (by created_at). So concatenating the lists
 *    and keeping the first occurrence of each mood yields exactly that order.
 *  - Resets daily: the caller only passes TODAY's entries, so a new day starts empty.
 */
import { MOOD_KEYS, isMoodKey, type MoodKey } from '@theme';

/**
 * Moods logged today, deduped in first-selected order.
 * @param entryMoodLists today's entries' mood arrays, oldest entry first, each in tap order.
 */
export function selectedMoodsToday(
  entryMoodLists: readonly (readonly string[])[],
): MoodKey[] {
  const seen = new Set<MoodKey>();
  const out: MoodKey[] = [];
  for (const list of entryMoodLists) {
    for (const raw of list) {
      if (isMoodKey(raw) && !seen.has(raw)) {
        seen.add(raw);
        out.push(raw);
      }
    }
  }
  return out;
}

/**
 * The full Today's Mood row order: today's selected moods first (in first-selected order), then the
 * remaining moods in their normal fixed order. Ignores unknown/duplicate keys defensively.
 */
export function todaysMoodOrder(selectedToday: readonly MoodKey[]): MoodKey[] {
  const sel: MoodKey[] = [];
  const seen = new Set<MoodKey>();
  for (const k of selectedToday) {
    if (isMoodKey(k) && !seen.has(k)) {
      seen.add(k);
      sel.push(k);
    }
  }
  return [...sel, ...MOOD_KEYS.filter((k) => !seen.has(k))];
}
