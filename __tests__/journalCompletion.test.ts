import {
  ENTRY_COMPLETION,
  resolveCompletion,
  canSubmitEntry,
  shouldRegenerateInsight,
  homeGreeting,
  type CompletionDeps,
} from '@features/journal/logic';
import {
  NEW_LONGEST_MESSAGE,
  REGULAR_LINES,
  STARTING_OVER_MESSAGE,
  regularLineIndex,
} from '@features/journal/streakMessages';

describe('homeGreeting — time-of-day home header', () => {
  it('says Good morning from 05:00 through 11:59', () => {
    expect(homeGreeting('Ada', 5)).toBe('Good morning, Ada');
    expect(homeGreeting('Ada', 9)).toBe('Good morning, Ada');
    expect(homeGreeting('Ada', 11)).toBe('Good morning, Ada');
  });

  it('says Good afternoon from 12:00 through 16:59', () => {
    expect(homeGreeting('Ada', 12)).toBe('Good afternoon, Ada');
    expect(homeGreeting('Ada', 16)).toBe('Good afternoon, Ada');
  });

  it('says Good evening from 17:00 through 23:59', () => {
    expect(homeGreeting('Ada', 17)).toBe('Good evening, Ada');
    expect(homeGreeting('Ada', 23)).toBe('Good evening, Ada');
  });

  it('falls back to plain Hello from 00:00 through 04:59 (middle of the night)', () => {
    expect(homeGreeting('Ada', 0)).toBe('Hello, Ada');
    expect(homeGreeting('Ada', 4)).toBe('Hello, Ada');
  });

  it('switches exactly on the boundary hours', () => {
    expect(homeGreeting('Ada', 4)).toBe('Hello, Ada'); // 04:59 → still night
    expect(homeGreeting('Ada', 5)).toBe('Good morning, Ada'); // 05:00 → morning
    expect(homeGreeting('Ada', 11)).toBe('Good morning, Ada'); // 11:59 → morning
    expect(homeGreeting('Ada', 12)).toBe('Good afternoon, Ada'); // 12:00 → afternoon
    expect(homeGreeting('Ada', 16)).toBe('Good afternoon, Ada'); // 16:59 → afternoon
    expect(homeGreeting('Ada', 17)).toBe('Good evening, Ada'); // 17:00 → evening
  });

  // Client 10/14 p.10: "there" is a broken placeholder. With no name (only while the profile is
  // still loading) the greeting stands alone.
  it('never shows a placeholder name: without a name it is the greeting alone', () => {
    expect(homeGreeting(null, 9)).toBe('Good morning');
    expect(homeGreeting(null, 14)).toBe('Good afternoon');
    expect(homeGreeting(null, 20)).toBe('Good evening');
    expect(homeGreeting(null, 2)).toBe('Hello');
    expect(homeGreeting(null, 9)).not.toContain('there');
  });
});

describe('journal completion (§2)', () => {
  // Client revisions 10/14 p.24 to 27: the day's first entry gets the streak popup (streak + message
  // line); later entries that day keep "Entry complete".
  describe('resolveCompletion — same streak as Insights, first entry of the day', () => {
    const entry = { id: 'e3', local_date: '2026-09-28' };
    const stats = (
      current_streak: number,
      last_entry_date: string | null = '2026-09-28',
      longest_streak = current_streak,
    ) => jest.fn().mockResolvedValue({ current_streak, last_entry_date, longest_streak });
    const deps = (over: Partial<CompletionDeps> = {}): CompletionDeps => ({
      firstEntryIdOfDay: async () => 'e3',
      freshStats: stats(3),
      previousLongest: async () => 0,
      userId: 'u1',
      ...over,
    });

    it('first entry of the day → the streak popup with the fresh Insights streak and its message', async () => {
      const freshStats = stats(3);
      await expect(resolveCompletion(entry, deps({ freshStats }))).resolves.toEqual({
        kind: 'streak',
        streak: 3,
        message: '3 days in a row. You’re building something here. See you tomorrow.',
      });
      expect(freshStats).toHaveBeenCalledTimes(1);
    });

    it('2nd/3rd entry that day → "Entry complete" (no streak) even though the streak is 3', async () => {
      await expect(
        resolveCompletion(entry, deps({ firstEntryIdOfDay: async () => 'e1' })),
      ).resolves.toEqual(ENTRY_COMPLETION);
    });

    it('day 1 again after an earlier streak → the starting over line', async () => {
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(1, '2026-09-28', 6), previousLongest: async () => 6 })),
      ).resolves.toEqual({ kind: 'streak', streak: 1, message: STARTING_OVER_MESSAGE });
    });

    it('the first day past the previous longest (from the server) → "Your longest streak yet."', async () => {
      const previousLongest = jest.fn().mockResolvedValue(5);
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(6), previousLongest })),
      ).resolves.toEqual({ kind: 'streak', streak: 6, message: NEW_LONGEST_MESSAGE });
      expect(previousLongest).toHaveBeenCalledTimes(1);
    });

    it('previous longest unavailable: an earlier, longer run still counts; otherwise no longest line is guessed', async () => {
      const fail = async () => {
        throw new Error('rpc');
      };
      // An earlier run of 6 is longer than today's 1 → it is the previous longest → starting over.
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(1, '2026-09-28', 6), previousLongest: fail })),
      ).resolves.toEqual({ kind: 'streak', streak: 1, message: STARTING_OVER_MESSAGE });
      // Today's run IS the longest (6 of 6): unknown previous → no "longest" line, the next rule applies.
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(6), previousLongest: fail })),
      ).resolves.toEqual({ kind: 'streak', streak: 6, message: 'Tomorrow is day 7. Don’t miss it.' });
    });

    it('a regular day picks its line from the user and the run (same answer every time)', async () => {
      // Streak 5 on Sep 28: the run started Sep 24.
      const expected = REGULAR_LINES[regularLineIndex('u1|2026-09-24', 5)]!(5);
      await expect(resolveCompletion(entry, deps({ freshStats: stats(5) }))).resolves.toEqual({
        kind: 'streak',
        streak: 5,
        message: expected,
      });
      await expect(resolveCompletion(entry, deps({ freshStats: stats(5) }))).resolves.toEqual({
        kind: 'streak',
        streak: 5,
        message: expected,
      });
    });

    it('stats that do not yet include this entry day are not trusted', async () => {
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(2, '2026-09-27') })),
      ).resolves.toEqual(ENTRY_COMPLETION);
    });

    it('a zero/invalid streak never shows a number', async () => {
      await expect(resolveCompletion(entry, deps({ freshStats: stats(0) }))).resolves.toEqual(
        ENTRY_COMPLETION,
      );
      await expect(
        resolveCompletion(entry, deps({ freshStats: stats(Number.NaN) })),
      ).resolves.toEqual(ENTRY_COMPLETION);
    });

    it('any error falls back to "Entry complete" (never throws)', async () => {
      await expect(
        resolveCompletion(
          entry,
          deps({
            firstEntryIdOfDay: async () => {
              throw new Error('network');
            },
          }),
        ),
      ).resolves.toEqual(ENTRY_COMPLETION);
      await expect(
        resolveCompletion(entry, deps({ freshStats: jest.fn().mockRejectedValue(new Error('rpc')) })),
      ).resolves.toEqual(ENTRY_COMPLETION);
    });

    it('a slow lookup times out to "Entry complete" so the save never hangs', async () => {
      await expect(
        resolveCompletion(
          entry,
          deps({ firstEntryIdOfDay: () => new Promise(() => {}), timeoutMs: 20 }),
        ),
      ).resolves.toEqual(ENTRY_COMPLETION);
    });
  });

  describe('canSubmitEntry — required fields + duplicate-submission guard', () => {
    const base = {
      hasMood: true,
      hasNote: true,
      saving: false,
      creating: false,
      updating: false,
    };

    it('allows a save when a mood + note are set and nothing is in flight', () => {
      expect(canSubmitEntry(base)).toBe(true);
    });

    it('requires at least one mood', () => {
      expect(canSubmitEntry({ ...base, hasMood: false })).toBe(false);
    });

    it('requires a non-empty note (the note is mandatory)', () => {
      expect(canSubmitEntry({ ...base, hasNote: false })).toBe(false);
    });

    it('blocks duplicate taps while a save is in flight', () => {
      expect(canSubmitEntry({ ...base, saving: true })).toBe(false);
      expect(canSubmitEntry({ ...base, creating: true })).toBe(false);
      expect(canSubmitEntry({ ...base, updating: true })).toBe(false);
    });
  });

  describe('shouldRegenerateInsight — regenerate on mood OR note change', () => {
    const prev = { note: 'a good day', mood_slugs: ['happy'] };

    it('regenerates when only the mood changes', () => {
      expect(shouldRegenerateInsight(prev, { note: 'a good day', moods: ['sad'] })).toBe(
        true,
      );
    });

    it('regenerates when only the note changes', () => {
      expect(
        shouldRegenerateInsight(prev, { note: 'a rough day', moods: ['happy'] }),
      ).toBe(true);
    });

    it('regenerates when both change', () => {
      expect(shouldRegenerateInsight(prev, { note: 'different', moods: ['calm'] })).toBe(
        true,
      );
    });

    it('regenerates when an additional mood is added (set changed)', () => {
      expect(
        shouldRegenerateInsight(prev, { note: 'a good day', moods: ['happy', 'calm'] }),
      ).toBe(true);
    });

    it('does NOT regenerate when neither changes (order-independent set match)', () => {
      expect(
        shouldRegenerateInsight(prev, { note: 'a good day', moods: ['happy'] }),
      ).toBe(false);
      expect(
        shouldRegenerateInsight(
          { note: 'a good day', mood_slugs: ['happy', 'sad'] },
          { note: 'a good day', moods: ['sad', 'happy'] },
        ),
      ).toBe(false);
    });

    it('falls back to the legacy single mood_slug', () => {
      expect(
        shouldRegenerateInsight(
          { note: 'x', mood_slug: 'happy' },
          { note: 'x', moods: ['happy'] },
        ),
      ).toBe(false);
    });

    it('treats a cleared note (null) as a change', () => {
      expect(shouldRegenerateInsight(prev, { note: null, moods: ['happy'] })).toBe(true);
      expect(
        shouldRegenerateInsight(
          { note: null, mood_slugs: ['happy'] },
          { note: null, moods: ['happy'] },
        ),
      ).toBe(false);
    });
  });
});
