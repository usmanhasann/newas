/**
 * The 8pm reminder's push copy (Task 3; streak milestones, client revisions 10/14 p.28 to 29).
 * Qualifying (active streak + today not journaled) is decided in SQL and covered by
 * shouldSendStreakReminder in streakStatus.test; this pins the message text. [X] is the streak
 * through yesterday, [X+1] what checking in today makes it.
 */
import { streakReminderMessage } from '../supabase/functions/_shared/streakReminder';

describe('streakReminderMessage', () => {
  it('regular days: the reminder as it was (title and body)', () => {
    expect(streakReminderMessage(5)).toEqual({
      title: 'Don’t lose your streak',
      body: 'Keep your 5 day streak going and journal before midnight.',
    });
    expect(streakReminderMessage(1).body).toBe('Keep your 1 day streak going and journal before midnight.');
  });

  it('1. [X+1] is a milestone: names both numbers, title unchanged', () => {
    expect(streakReminderMessage(29)).toEqual({
      title: 'Don’t lose your streak',
      body: 'Don’t lose your 29 day streak. Check in before midnight to reach day 30.',
    });
    expect(streakReminderMessage(2).body).toBe(
      'Don’t lose your 2 day streak. Check in before midnight to reach day 3.',
    );
    expect(streakReminderMessage(729).body).toBe(
      'Don’t lose your 729 day streak. Check in before midnight to reach day 730.',
    );
    expect(streakReminderMessage(399).body).toBe(
      'Don’t lose your 399 day streak. Check in before midnight to reach day 400.',
    );
  });

  it('commas from 1,000 up', () => {
    expect(streakReminderMessage(999).body).toBe(
      'Don’t lose your 999 day streak. Check in before midnight to reach day 1,000.',
    );
    expect(streakReminderMessage(1099).body).toBe(
      'Don’t lose your 1,099 day streak. Check in before midnight to reach day 1,100.',
    );
    expect(streakReminderMessage(1234).body).toBe(
      'Keep your 1,234 day streak going and journal before midnight.',
    );
  });

  it('2. [X+1] would beat the longest streak before this run: the longest streak line', () => {
    expect(streakReminderMessage(10, 10)).toEqual({
      title: 'Don’t lose your streak',
      body: 'Check in before midnight to achieve your longest streak.',
    });
  });

  it('2. only the day it would first beat it (after that, the regular reminder)', () => {
    expect(streakReminderMessage(11, 10).body).toBe(
      'Keep your 11 day streak going and journal before midnight.',
    );
    expect(streakReminderMessage(8, 10).body).toBe(
      'Keep your 8 day streak going and journal before midnight.',
    );
  });

  it('2. never during a first streak (no earlier run of 2+ days)', () => {
    expect(streakReminderMessage(4, 0).body).toBe('Keep your 4 day streak going and journal before midnight.');
    expect(streakReminderMessage(1, 1).body).toBe('Keep your 1 day streak going and journal before midnight.');
  });

  it('a milestone wins over the longest streak line', () => {
    expect(streakReminderMessage(6, 6).body).toBe(
      'Don’t lose your 6 day streak. Check in before midnight to reach day 7.',
    );
  });
});
