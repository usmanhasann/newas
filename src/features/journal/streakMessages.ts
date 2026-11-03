/**
 * The streak popup's message line and the daily check-in's milestone line (client revisions 10/14,
 * pages 24 to 28). Pure: the streak numbers, dates and seed are passed in, so every rule is
 * unit-testable. Milestone days come from streakMilestones.ts, the same rules the 8pm streak
 * reminder uses on the server.
 */
import { addDaysToLocalDate } from '@utils/date';
import { formatCount, isStreakAnniversary, isStreakMilestone } from './streakMilestones';

/** Section 4: the message for each listed milestone day (day 1 included). */
const LISTED_MESSAGES: Readonly<Record<number, string>> = {
  1: 'Great start. Come back tomorrow to make it 2.',
  3: '3 days in a row. You’re building something here. See you tomorrow.',
  7: 'One full week! Let’s start week two tomorrow.',
  14: 'Two weeks of checking in. Keep it going tomorrow.',
  30: 'A whole month of showing up. Keep it going tomorrow.',
  50: '50 days. Halfway to 100. See you tomorrow.',
  100: '100 days. Tomorrow starts the next hundred.',
  150: '150 days of showing up for yourself. See you tomorrow.',
  200: '200 days. That’s who you are now. See you tomorrow.',
  250: '250 days. A quarter of the way to 1,000. See you tomorrow.',
  300: '300 days. One year is right around the corner.',
  365: 'One full year of journaling. Tomorrow starts year two.',
  500: '500 days. Few people ever get here. See you tomorrow.',
  1000: '1,000 days. Truly incredible. See you tomorrow.',
};

/** Section 7: day 1 again after an earlier streak. */
export const STARTING_OVER_MESSAGE = 'Every streak starts with day 1. Come back tomorrow to make it 2.';

/** Section 5: the first day past the previous longest streak. */
export const NEW_LONGEST_MESSAGE = 'Your longest streak yet. Let’s beat it again tomorrow.';

/** Section 8: the regular-day lines, [X] = today's streak, [X+1] = tomorrow's. */
export const REGULAR_LINES: readonly ((streak: number) => string)[] = [
  (x) => `See you tomorrow for day ${formatCount(x + 1)}.`,
  (x) => `Day ${formatCount(x)} done. Tomorrow makes ${formatCount(x + 1)}.`,
  () => 'Another day for you. See you tomorrow.',
  (x) => `Keep showing up. Day ${formatCount(x + 1)} is tomorrow.`,
];

/**
 * A streak counts as "a streak before" (section 7) and an earlier streak exists (section 5, "never
 * during a user's first-ever streak") once an earlier run reached 2 days in a row. A lone day is
 * not a streak to start over from.
 */
const MIN_EARLIER_STREAK = 2;

/**
 * The milestone message for a streak of `day` days (section 4), or null on any other day. A yearly
 * anniversary wins over the every-100-days list (7,300 days is 20 years).
 */
export function milestoneMessage(day: number): string | null {
  if (isStreakAnniversary(day)) {
    const years = day / 365;
    return `${formatCount(years)} years of journaling. Tomorrow starts year ${formatCount(years + 1)}.`;
  }
  const listed = LISTED_MESSAGES[day];
  if (listed) return listed;
  if (isStreakMilestone(day)) return `${formatCount(day)} days. See you tomorrow for ${formatCount(day + 1)}.`;
  return null;
}

/** 32-bit FNV-1a: a small, stable string hash for the regular-day pick. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which regular-day line a streak of `streak` days shows (section 8): a random looking pick that is
 * never the same as the day before. Two days in a row always means consecutive streak numbers in the
 * same run, so each day steps from the previous day's line to one of the OTHER three, chosen by a
 * hash of the run's seed. Same answer on every device, with nothing to store.
 */
export function regularLineIndex(seed: string, streak: number): number {
  const count = REGULAR_LINES.length;
  let index = hash(`${seed}|0`) % count;
  for (let day = 1; day <= streak; day++) {
    index = (index + 1 + (hash(`${seed}|${day}`) % (count - 1))) % count;
  }
  return index;
}

export interface StreakPopupInput {
  /** The current streak including today (the number the popup shows). */
  streak: number;
  /** The longest run BEFORE the current one (0 when there was none). */
  previousLongest: number;
  /** Stable per run (user + the run's first day): drives the regular-day pick. */
  seed: string;
}

/**
 * The popup's message line (section 3): the first rule that applies of
 *   1. starting over after a broken streak, 2. a milestone day, 3. a new longest streak,
 *   4. the day before a milestone, 5. a regular day.
 */
export function streakPopupMessage({ streak, previousLongest, seed }: StreakPopupInput): string {
  const hadStreak = previousLongest >= MIN_EARLIER_STREAK;
  if (streak === 1 && hadStreak) return STARTING_OVER_MESSAGE;
  const milestone = milestoneMessage(streak);
  if (milestone) return milestone;
  // Only the first day past the previous longest: the day after, the streak is 2 past it.
  if (hadStreak && streak === previousLongest + 1) return NEW_LONGEST_MESSAGE;
  // [X] here is the next milestone day, which is tomorrow (decision: section 6 defines it so).
  if (isStreakMilestone(streak + 1)) return `Tomorrow is day ${formatCount(streak + 1)}. Don’t miss it.`;
  return REGULAR_LINES[regularLineIndex(seed, streak)]!(streak);
}

/** The daily check-in's line on a milestone eve (section "Daily journaling reminder"). */
function checkInMilestoneBody(nextDay: number): string {
  return `Today could be day ${formatCount(nextDay)}. Take a minute to check in.`;
}

export interface StreakSnapshot {
  /** get_journal_stats current_streak: consecutive days through the last journaled day. */
  currentStreak: number;
  /** The last journaled local day (YYYY-MM-DD), null when none. */
  lastEntryDate: string | null;
}

/**
 * Which scheduled daily check-ins carry the milestone line instead of the day's rotating prompt,
 * keyed by local date. [X] is the streak through yesterday and [X+1] what it becomes with a check-in
 * that day; the line replaces the prompt only while that day has no entry yet and [X+1] is a
 * milestone. So: journaled today, only tomorrow can qualify (today keeps its prompt); not yet,
 * only today can (missing today breaks the streak, and journaling re-plans the check-ins). Every
 * other day keeps its prompt and the rotation itself never changes.
 */
export function checkInMilestoneBodies(
  today: string,
  streak: StreakSnapshot | null,
): Record<string, string> {
  if (!streak?.lastEntryDate || !(streak.currentStreak >= 1)) return {};
  const current = Math.floor(streak.currentStreak);
  let day: string | null = null;
  if (streak.lastEntryDate === today) day = addDaysToLocalDate(today, 1);
  else if (streak.lastEntryDate === addDaysToLocalDate(today, -1)) day = today;
  if (!day || !isStreakMilestone(current + 1)) return {};
  return { [day]: checkInMilestoneBody(current + 1) };
}
