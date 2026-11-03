// Streak milestone days + number formatting (client revisions 10/14, pages 24 to 29). Pure: no I/O,
// no React Native APIs. The 8pm streak reminder (supabase/functions/_shared/streakReminder.ts) keeps
// an identical copy of isStreakMilestone and formatCount, and a Jest test fails if the two ever
// disagree, so the popup, the daily check-in and the reminder always agree on the milestone days.

/** The listed milestone days (the popup's day 1 is separate: it is not a reminder milestone). */
const LISTED_STREAK_MILESTONES: readonly number[] = [
  3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 500, 1000,
];

const DAYS_PER_YEAR = 365;

/** A yearly anniversary after the first year: 730, 1,095, 1,460 and so on. */
export function isStreakAnniversary(day: number): boolean {
  return Number.isInteger(day) && day > DAYS_PER_YEAR && day % DAYS_PER_YEAR === 0;
}

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
