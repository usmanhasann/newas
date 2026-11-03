// Pure copy for the 8pm "before you lose your streak" reminder. No I/O / no Deno APIs, so the edge
// function and the Jest test share the SAME source. The qualifying decision (active streak + today
// not journaled) and the timing are made in SQL (claim_streak_reminders, unchanged); this only words
// the message from the numbers that came back (client revisions 10/14 p.27 to 29).
//
// The milestone days and number formatting below are the app's own rules (the streak popup and the
// daily check-in, src/features/journal/streakMilestones.ts). Edge functions can't import app code, so
// this keeps an identical copy and a Jest test checks the two agree on every day up to 20,000.

/** The listed milestone days (the popup's day 1 is separate: it is not a reminder milestone). */
const LISTED_STREAK_MILESTONES: readonly number[] = [
  3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 500, 1000,
];

const DAYS_PER_YEAR = 365;

/**
 * Whether a streak of `day` days is a milestone: the listed days, every yearly anniversary
 * (730, 1,095, ...) and every 100 days after 365 (400, 600, 700, ...). Day 1 is not one.
 */
export function isStreakMilestone(day: number): boolean {
  if (!Number.isInteger(day) || day < 2) return false;
  if (LISTED_STREAK_MILESTONES.includes(day)) return true;
  return day > DAYS_PER_YEAR && (day % DAYS_PER_YEAR === 0 || day % 100 === 0);
}

/** A whole number with commas from 1,000 up ("1,000", "12,345"); smaller numbers unchanged. */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** An earlier run of 2+ days in a row: before that, the current run is the user's first streak. */
const MIN_EARLIER_STREAK = 2;

export const STREAK_REMINDER_TITLE = 'Don’t lose your streak';

/**
 * Push title + body for a user whose streak is about to lapse. `streak` is [X], the streak through
 * yesterday (today isn't journaled yet); [X+1] is what checking in today makes it.
 * `previousLongest` is the longest run before this one (0 if none). The first rule that applies:
 *   1. [X+1] is a milestone: "Don’t lose your [X] day streak. Check in before midnight to reach day [X+1]."
 *   2. [X+1] beats the longest streak before this run (only the day it first would, and never during
 *      a first streak): "Check in before midnight to achieve your longest streak."
 *   3. Otherwise the reminder as it was.
 * The title is unchanged; numbers from 1,000 up get commas.
 */
export function streakReminderMessage(
  streak: number,
  previousLongest = 0,
): { title: string; body: string } {
  const x = Math.floor(streak);
  const next = x + 1;
  let body: string;
  if (isStreakMilestone(next)) {
    body = `Don’t lose your ${formatCount(x)} day streak. Check in before midnight to reach day ${formatCount(next)}.`;
  } else if (previousLongest >= MIN_EARLIER_STREAK && x === previousLongest) {
    body = 'Check in before midnight to achieve your longest streak.';
  } else {
    body = `Keep your ${formatCount(x)} day streak going and journal before midnight.`;
  }
  return { title: STREAK_REMINDER_TITLE, body };
}
