/**
 * Shared streak logic (Task 1): the indicator state machine and the reminder-qualifying check use one
 * threshold + one day boundary, so the badge and the 8pm push always agree. Plus hourInTZ, which
 * supplies the local hour the indicator's 8pm check reads.
 */
import {
  streakIndicatorState,
  shouldSendStreakReminder,
  STREAK_URGENT_HOUR,
} from '@features/journal';
import { hourInTZ } from '@utils/date';

describe('streakIndicatorState', () => {
  it('is hidden with no active streak, whatever the hour/entry', () => {
    expect(streakIndicatorState({ currentStreak: 0, hasEntryToday: false, localHour: 21 })).toBe('hidden');
    expect(streakIndicatorState({ currentStreak: 0, hasEntryToday: true, localHour: 9 })).toBe('hidden');
  });

  it('is normal with a streak when today is already journaled — even after 8pm', () => {
    expect(streakIndicatorState({ currentStreak: 5, hasEntryToday: true, localHour: 22 })).toBe('normal');
  });

  it('is normal with a streak, no entry yet, but before 8pm', () => {
    expect(streakIndicatorState({ currentStreak: 5, hasEntryToday: false, localHour: 19 })).toBe('normal');
  });

  it('turns urgent only at/after 8pm with a streak and no entry today', () => {
    expect(streakIndicatorState({ currentStreak: 5, hasEntryToday: false, localHour: 19 })).toBe('normal');
    expect(streakIndicatorState({ currentStreak: 5, hasEntryToday: false, localHour: STREAK_URGENT_HOUR })).toBe('urgent');
    expect(streakIndicatorState({ currentStreak: 1, hasEntryToday: false, localHour: 23 })).toBe('urgent');
  });
});

describe('shouldSendStreakReminder', () => {
  it('fires for a live streak whose day is not yet done', () => {
    expect(shouldSendStreakReminder({ currentStreak: 3, hasEntryToday: false })).toBe(true);
  });
  it('does not fire once today is journaled', () => {
    expect(shouldSendStreakReminder({ currentStreak: 3, hasEntryToday: true })).toBe(false);
  });
  it('does not fire with no active streak', () => {
    expect(shouldSendStreakReminder({ currentStreak: 0, hasEntryToday: false })).toBe(false);
  });

  it('matches the indicator: whenever it fires (at 8pm) the badge is urgent', () => {
    for (const currentStreak of [0, 1, 7]) {
      for (const hasEntryToday of [true, false]) {
        const fires = shouldSendStreakReminder({ currentStreak, hasEntryToday });
        const state = streakIndicatorState({ currentStreak, hasEntryToday, localHour: STREAK_URGENT_HOUR });
        expect(fires).toBe(state === 'urgent');
      }
    }
  });
});

describe('hourInTZ', () => {
  it('reads the hour in the given timezone (0–23)', () => {
    // 2026-01-15T18:30:00Z → 13:30 in New York (UTC-5 in winter) → hour 13.
    const d = new Date('2026-01-15T18:30:00Z');
    expect(hourInTZ(d, 'America/New_York')).toBe(13);
    // Same instant is 03:30 next day in Tokyo (UTC+9) → hour 3.
    expect(hourInTZ(d, 'Asia/Tokyo')).toBe(3);
  });

  it('falls back to the device hour on a bad timezone', () => {
    const d = new Date('2026-01-15T18:30:00Z');
    expect(hourInTZ(d, 'Not/AZone')).toBe(d.getHours());
  });
});
