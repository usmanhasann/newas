import {
  ENTRY_MOOD_LIMIT,
  toggleEntryMood,
  entryMoodSlotsRemaining,
  isEntryMoodLimitReached,
  disabledEntryMoodKeys,
  moodSlotsLabel,
} from '@features/moods/entrySelection';
import { MOOD_KEYS, type MoodKey } from '@theme/moods';

describe('per-entry mood selection (§1.2/§1.3 — up to 3 moods per entry, no per-user cap)', () => {
  it('caps at 3', () => {
    expect(ENTRY_MOOD_LIMIT).toBe(3);
  });

  describe('toggleEntryMood', () => {
    it('adds a mood when there is room', () => {
      expect(toggleEntryMood([], 'happy')).toEqual(['happy']);
      expect(toggleEntryMood(['happy'], 'sad')).toEqual(['happy', 'sad']);
    });

    it('removes a mood that is already selected (restores a slot)', () => {
      expect(toggleEntryMood(['happy', 'sad'], 'happy')).toEqual(['sad']);
    });

    it('does not add a 4th distinct mood once full (no-op)', () => {
      const full: MoodKey[] = ['happy', 'sad', 'calm'];
      expect(toggleEntryMood(full, 'angry')).toEqual(full);
    });

    it('replacing a mood nets zero against the cap (§1.3)', () => {
      // Entry has one mood → "Two mood slots remaining".
      let sel: MoodKey[] = ['grateful'];
      expect(entryMoodSlotsRemaining(sel)).toBe(2);
      // Swap grateful → tired: remove then add.
      sel = toggleEntryMood(sel, 'grateful'); // []
      sel = toggleEntryMood(sel, 'tired'); // ['tired']
      expect(sel).toEqual(['tired']);
      // Still two slots remaining — a swap never consumed an extra slot.
      expect(entryMoodSlotsRemaining(sel)).toBe(2);
    });
  });

  describe('entryMoodSlotsRemaining', () => {
    it('counts down from the max', () => {
      expect(entryMoodSlotsRemaining([])).toBe(3);
      expect(entryMoodSlotsRemaining(['happy'])).toBe(2);
      expect(entryMoodSlotsRemaining(['happy', 'sad', 'calm'])).toBe(0);
    });
    it('never goes negative', () => {
      expect(entryMoodSlotsRemaining(['a', 'b', 'c', 'd'])).toBe(0);
    });
  });

  describe('isEntryMoodLimitReached', () => {
    it('is reached only at the cap', () => {
      expect(isEntryMoodLimitReached(['happy', 'sad'])).toBe(false);
      expect(isEntryMoodLimitReached(['happy', 'sad', 'calm'])).toBe(true);
    });
  });

  describe('disabledEntryMoodKeys', () => {
    it('disables nothing while slots remain', () => {
      expect(disabledEntryMoodKeys([])).toEqual([]);
      expect(disabledEntryMoodKeys(['happy', 'sad'])).toEqual([]);
    });
    it('disables every UNSELECTED mood once full (selected stay tappable to swap)', () => {
      const sel: MoodKey[] = ['happy', 'sad', 'calm'];
      const disabled = disabledEntryMoodKeys(sel);
      for (const s of sel) expect(disabled).not.toContain(s);
      expect(disabled.sort()).toEqual(MOOD_KEYS.filter((k) => !sel.includes(k)).sort());
    });
  });

  describe('moodSlotsLabel (spec §1.3 wording)', () => {
    it('uses word form for remaining slots', () => {
      expect(moodSlotsLabel(0)).toBe('Three mood slots remaining');
      expect(moodSlotsLabel(1)).toBe('Two mood slots remaining');
      expect(moodSlotsLabel(2)).toBe('One mood slot remaining');
    });
    it('invites a swap at the cap instead of showing "0 slots"', () => {
      expect(moodSlotsLabel(3)).toBe('You’ve picked 3 moods. Tap one to swap it.');
    });
    it('a swap keeps the same "Two mood slots remaining" (§1.3)', () => {
      // one mood before and after a replacement
      expect(moodSlotsLabel(1)).toBe('Two mood slots remaining');
    });
  });

  // Locked regression for the exact client scenario + forbidden wording. Do not weaken.
  describe('LOCKED regression — grateful → tired keeps two slots, never "1 out of 3"', () => {
    it('replacing the only mood keeps "Two mood slots remaining"', () => {
      let sel: MoodKey[] = ['grateful'];
      expect(moodSlotsLabel(sel.length)).toBe('Two mood slots remaining');
      sel = toggleEntryMood(sel, 'grateful'); // remove grateful → []
      sel = toggleEntryMood(sel, 'tired'); // add tired → ['tired']
      expect(sel).toEqual(['tired']);
      expect(moodSlotsLabel(sel.length)).toBe('Two mood slots remaining');
    });

    it('never emits "out of" / "left of" / per-day wording for any count', () => {
      for (let n = 0; n <= 3; n++) {
        const label = moodSlotsLabel(n);
        expect(label).not.toMatch(/out of/i);
        expect(label).not.toMatch(/left of/i);
        expect(label).not.toMatch(/per day|daily/i);
      }
    });

    it('cap is per entry, never across a day — a full entry blocks a 4th; removal frees a slot', () => {
      const full: MoodKey[] = ['happy', 'sad', 'calm'];
      expect(toggleEntryMood(full, 'angry')).toEqual(full); // 4th blocked within the entry
      expect(toggleEntryMood(full, 'sad')).toEqual(['happy', 'calm']); // removal frees a slot
      expect(entryMoodSlotsRemaining([])).toBe(3); // a new entry always starts fresh
    });
  });
});
