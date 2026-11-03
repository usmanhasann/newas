/**
 * Streak milestones (client revisions 10/14, p.24 to 29): the popup's message rules, the milestone
 * days, number formatting and the daily check-in's milestone line. The exact strings are the
 * client's words (curly apostrophes, as the app writes them).
 */
import * as app from '@features/journal/streakMilestones';
import * as server from '../supabase/functions/_shared/streakReminder';
import {
  NEW_LONGEST_MESSAGE,
  REGULAR_LINES,
  STARTING_OVER_MESSAGE,
  checkInMilestoneBodies,
  milestoneMessage,
  regularLineIndex,
  streakPopupMessage,
} from '@features/journal/streakMessages';

const popup = (streak: number, previousLongest = 0, seed = 'seed') =>
  streakPopupMessage({ streak, previousLongest, seed });

describe('milestone days (shared by the popup, the daily check-in and the 8pm reminder)', () => {
  it('are the listed days, every yearly anniversary and every 100 days after 365', () => {
    const upTo1200 = Array.from({ length: 1200 }, (_, i) => i + 1).filter(app.isStreakMilestone);
    expect(upTo1200).toEqual([
      3, 7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000,
      1095, 1100, 1200,
    ]);
    expect(app.isStreakMilestone(1460)).toBe(true);
    expect(app.isStreakMilestone(7300)).toBe(true);
  });

  it('day 1 is not a reminder milestone (it only has a popup message)', () => {
    expect(app.isStreakMilestone(1)).toBe(false);
    expect(app.isStreakMilestone(0)).toBe(false);
    expect(app.isStreakMilestone(2.5)).toBe(false);
  });

  it('the 8pm reminder (edge function copy) agrees with the app on every day up to 20,000', () => {
    for (let day = -1; day <= 20000; day++) {
      if (server.isStreakMilestone(day) !== app.isStreakMilestone(day)) {
        throw new Error(`milestone mismatch on day ${day}`);
      }
      if (server.formatCount(day) !== app.formatCount(day)) {
        throw new Error(`format mismatch on ${day}`);
      }
    }
  });

  it('formats numbers with commas from 1,000 up', () => {
    expect(app.formatCount(7)).toBe('7');
    expect(app.formatCount(999)).toBe('999');
    expect(app.formatCount(1000)).toBe('1,000');
    expect(app.formatCount(12345)).toBe('12,345');
    expect(app.formatCount(1234567)).toBe('1,234,567');
  });
});

describe('popup milestone messages (section 4)', () => {
  it('uses the exact message for each listed day', () => {
    const expected: [number, string][] = [
      [1, 'Great start. Come back tomorrow to make it 2.'],
      [3, '3 days in a row. You’re building something here. See you tomorrow.'],
      [7, 'One full week! Let’s start week two tomorrow.'],
      [14, 'Two weeks of checking in. Keep it going tomorrow.'],
      [30, 'A whole month of showing up. Keep it going tomorrow.'],
      [50, '50 days. Halfway to 100. See you tomorrow.'],
      [100, '100 days. Tomorrow starts the next hundred.'],
      [150, '150 days of showing up for yourself. See you tomorrow.'],
      [200, '200 days. That’s who you are now. See you tomorrow.'],
      [250, '250 days. A quarter of the way to 1,000. See you tomorrow.'],
      [300, '300 days. One year is right around the corner.'],
      [365, 'One full year of journaling. Tomorrow starts year two.'],
      [500, '500 days. Few people ever get here. See you tomorrow.'],
      [1000, '1,000 days. Truly incredible. See you tomorrow.'],
    ];
    for (const [day, message] of expected) {
      expect(milestoneMessage(day)).toBe(message);
      expect(popup(day)).toBe(message);
    }
  });

  it('every yearly anniversary after 365: "[Y] years of journaling. Tomorrow starts year [Y+1]."', () => {
    expect(popup(730)).toBe('2 years of journaling. Tomorrow starts year 3.');
    expect(popup(1095)).toBe('3 years of journaling. Tomorrow starts year 4.');
    expect(popup(1460)).toBe('4 years of journaling. Tomorrow starts year 5.');
  });

  it('every other 100 days after 365: "[X] days. See you tomorrow for [X+1]." with commas', () => {
    expect(popup(400)).toBe('400 days. See you tomorrow for 401.');
    expect(popup(600)).toBe('600 days. See you tomorrow for 601.');
    expect(popup(900)).toBe('900 days. See you tomorrow for 901.');
    expect(popup(1100)).toBe('1,100 days. See you tomorrow for 1,101.');
    expect(popup(2000)).toBe('2,000 days. See you tomorrow for 2,001.');
  });

  it('a day that is both an anniversary and a 100-day milestone uses the anniversary message', () => {
    expect(popup(7300)).toBe('20 years of journaling. Tomorrow starts year 21.');
  });

  it('other days have no milestone message', () => {
    for (const day of [2, 4, 29, 366, 401, 731]) expect(milestoneMessage(day)).toBeNull();
  });
});

describe('popup message order (section 3)', () => {
  it('1. starting over: day 1 after an earlier streak of 2+ days', () => {
    expect(STARTING_OVER_MESSAGE).toBe('Every streak starts with day 1. Come back tomorrow to make it 2.');
    expect(popup(1, 2)).toBe(STARTING_OVER_MESSAGE);
    expect(popup(1, 40)).toBe(STARTING_OVER_MESSAGE);
  });

  it('a first ever day 1, or one after only lone days, is the regular day 1 message', () => {
    expect(popup(1, 0)).toBe('Great start. Come back tomorrow to make it 2.');
    expect(popup(1, 1)).toBe('Great start. Come back tomorrow to make it 2.');
  });

  it('2. a milestone wins over a new longest streak (the longest line then never shows)', () => {
    expect(popup(7, 6)).toBe('One full week! Let’s start week two tomorrow.');
    expect(popup(8, 6)).not.toBe(NEW_LONGEST_MESSAGE);
  });

  it('3. new longest streak: only the first day past the previous longest', () => {
    expect(NEW_LONGEST_MESSAGE).toBe('Your longest streak yet. Let’s beat it again tomorrow.');
    expect(popup(6, 5)).toBe(NEW_LONGEST_MESSAGE);
    expect(popup(9, 5)).not.toBe(NEW_LONGEST_MESSAGE);
    expect(popup(5, 5)).not.toBe(NEW_LONGEST_MESSAGE);
  });

  it('3. never during a first ever streak (no earlier run of 2+ days)', () => {
    expect(popup(5, 0)).not.toBe(NEW_LONGEST_MESSAGE);
    expect(popup(2, 1)).toBe('Tomorrow is day 3. Don’t miss it.');
  });

  it('3. the new longest line wins over the day before a milestone', () => {
    expect(popup(29, 28)).toBe(NEW_LONGEST_MESSAGE);
  });

  it('4. day before a milestone: "Tomorrow is day [X]. Don’t miss it." with [X] the next milestone', () => {
    expect(popup(29)).toBe('Tomorrow is day 30. Don’t miss it.');
    expect(popup(2)).toBe('Tomorrow is day 3. Don’t miss it.');
    expect(popup(364)).toBe('Tomorrow is day 365. Don’t miss it.');
    expect(popup(399)).toBe('Tomorrow is day 400. Don’t miss it.');
    expect(popup(729)).toBe('Tomorrow is day 730. Don’t miss it.');
    expect(popup(999)).toBe('Tomorrow is day 1,000. Don’t miss it.');
  });

  it('5. regular days use one of the four lines with [X] and [X+1] filled in', () => {
    const lines = REGULAR_LINES.map((line) => line(5));
    expect(lines).toEqual([
      'See you tomorrow for day 6.',
      'Day 5 done. Tomorrow makes 6.',
      'Another day for you. See you tomorrow.',
      'Keep showing up. Day 6 is tomorrow.',
    ]);
    expect(lines).toContain(popup(5));
    expect(REGULAR_LINES.map((line) => line(1234))).toEqual([
      'See you tomorrow for day 1,235.',
      'Day 1,234 done. Tomorrow makes 1,235.',
      'Another day for you. See you tomorrow.',
      'Keep showing up. Day 1,235 is tomorrow.',
    ]);
  });

  it('5. never the same regular line two days in a row, and every line gets used', () => {
    const used = new Set<number>();
    let repeats = 0;
    for (let s = 0; s < 30; s++) {
      const seed = `user-${s}|2026-01-${String((s % 28) + 1).padStart(2, '0')}`;
      let previous = -1;
      for (let streak = 1; streak <= 120; streak++) {
        const index = regularLineIndex(seed, streak);
        if (REGULAR_LINES[index]!(streak) === popup(streak, 0, seed)) {
          used.add(index);
          if (index === previous) repeats += 1;
        }
        // Even across a milestone day in between, the line steps away from the day before's.
        previous = index;
      }
    }
    expect(repeats).toBe(0);
    expect([...used].sort()).toEqual([0, 1, 2, 3]);
  });

  it('the pick is stable for the same user and run', () => {
    expect(popup(5, 0, 'u1|2026-09-24')).toBe(popup(5, 0, 'u1|2026-09-24'));
  });
});

describe('daily check-in milestone line', () => {
  const today = '2026-10-20';

  it('not journaled yet today and [X+1] is a milestone: today’s check-in says so', () => {
    expect(checkInMilestoneBodies(today, { currentStreak: 29, lastEntryDate: '2026-10-19' })).toEqual({
      '2026-10-20': 'Today could be day 30. Take a minute to check in.',
    });
  });

  it('already journaled today: today keeps its prompt; tomorrow gets the line if that is a milestone', () => {
    expect(checkInMilestoneBodies(today, { currentStreak: 29, lastEntryDate: today })).toEqual({
      '2026-10-21': 'Today could be day 30. Take a minute to check in.',
    });
    expect(checkInMilestoneBodies(today, { currentStreak: 30, lastEntryDate: today })).toEqual({});
  });

  it('a broken streak (or none) has no milestone: day 1 is never one', () => {
    expect(checkInMilestoneBodies(today, { currentStreak: 0, lastEntryDate: '2026-10-17' })).toEqual({});
    expect(checkInMilestoneBodies(today, { currentStreak: 29, lastEntryDate: '2026-10-18' })).toEqual({});
    expect(checkInMilestoneBodies(today, { currentStreak: 0, lastEntryDate: null })).toEqual({});
    expect(checkInMilestoneBodies(today, null)).toEqual({});
  });

  it('a regular next day keeps the prompt', () => {
    expect(checkInMilestoneBodies(today, { currentStreak: 30, lastEntryDate: '2026-10-19' })).toEqual({});
    expect(checkInMilestoneBodies(today, { currentStreak: 1, lastEntryDate: '2026-10-19' })).toEqual({});
  });

  it('commas from 1,000 and across month and year ends', () => {
    expect(
      checkInMilestoneBodies('2026-01-01', { currentStreak: 999, lastEntryDate: '2025-12-31' }),
    ).toEqual({ '2026-01-01': 'Today could be day 1,000. Take a minute to check in.' });
    expect(
      checkInMilestoneBodies('2026-01-31', { currentStreak: 729, lastEntryDate: '2026-01-31' }),
    ).toEqual({ '2026-02-01': 'Today could be day 730. Take a minute to check in.' });
  });
});
