/**
 * Streak status — ONE source of truth shared by the Home "Today's Mood" streak indicator and the 8pm
 * "before you lose it" reminder, so the two can never contradict each other (someone who taps the
 * reminder and opens the app sees the matching urgent state, not a calm one).
 *
 * Pure (no I/O): the caller supplies the server-computed streak, whether today's entry exists, and the
 * current local hour. The "day" is the user's LOCAL calendar day with a MIDNIGHT reset — the same
 * boundary get_journal_stats (current_streak / last_entry_date), the mood-row reset, and the prompt
 * rotation all use. `currentStreak`/`hasEntryToday` come from get_journal_stats (hasEntryToday =
 * last_entry_date === today's local date); `localHour` is the hour in the user's timezone.
 */
export type StreakIndicatorState = 'hidden' | 'normal' | 'urgent';

/**
 * 8pm local — the single threshold for BOTH the urgent indicator and the reminder. At/after this hour,
 * with today's entry still missing and a live streak, the indicator turns urgent and the reminder fires.
 */
export const STREAK_URGENT_HOUR = 20;

/**
 * What the home-screen streak indicator should show:
 *  - hidden: no active streak (nothing to protect) — never shown.
 *  - urgent: active streak, today's entry NOT made, and it's at/after 8pm local (about to be lost).
 *  - normal: active streak otherwise (before 8pm, or already journaled today).
 */
export function streakIndicatorState(input: {
  currentStreak: number;
  hasEntryToday: boolean;
  localHour: number;
}): StreakIndicatorState {
  if (input.currentStreak < 1) return 'hidden';
  const atRisk = !input.hasEntryToday && input.localHour >= STREAK_URGENT_HOUR;
  return atRisk ? 'urgent' : 'normal';
}

/**
 * Whether the 8pm reminder should fire for a user: an active streak whose day isn't done yet. This is
 * the SAME "at risk" condition the urgent indicator uses; it's evaluated at the user's local 8pm, so
 * the hour check (STREAK_URGENT_HOUR) is implicit and only the streak + today-entry state remain.
 */
export function shouldSendStreakReminder(input: {
  currentStreak: number;
  hasEntryToday: boolean;
}): boolean {
  return input.currentStreak >= 1 && !input.hasEntryToday;
}
