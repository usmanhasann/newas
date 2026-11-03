import { selectedMoodsToday, todaysMoodOrder } from '@features/moods';
import { MOOD_KEYS } from '@theme';

describe("Today's Mood ordering (§3 home highlight)", () => {
  describe('selectedMoodsToday — accumulate across the day in first-selected order', () => {
    it('is empty when there are no entries today (fresh day)', () => {
      expect(selectedMoodsToday([])).toEqual([]);
    });

    it('preserves tap order within a single entry (Tired tapped before Calm → Tired first)', () => {
      expect(selectedMoodsToday([['tired', 'calm']])).toEqual(['tired', 'calm']);
    });

    it('accumulates ALL moods across every entry that day, earlier entry first (spec example)', () => {
      // 3pm entry [Tired, Calm], evening entry [Happy, Content] → all four highlighted, that order.
      expect(
        selectedMoodsToday([
          ['tired', 'calm'],
          ['happy', 'content'],
        ]),
      ).toEqual(['tired', 'calm', 'happy', 'content']);
    });

    it('keeps a mood at its FIRST-selected position if re-picked in a later entry', () => {
      expect(
        selectedMoodsToday([
          ['tired', 'calm'],
          ['calm', 'happy'],
        ]),
      ).toEqual(['tired', 'calm', 'happy']);
    });

    it('ignores unknown mood slugs defensively', () => {
      expect(selectedMoodsToday([['tired', 'bogus', 'calm']])).toEqual(['tired', 'calm']);
    });

    it('handles legacy single-mood entries', () => {
      expect(selectedMoodsToday([['happy'], ['sad']])).toEqual(['happy', 'sad']);
    });
  });

  describe('todaysMoodOrder — selected first, rest in normal order', () => {
    it('is the normal fixed order when nothing is selected', () => {
      expect(todaysMoodOrder([])).toEqual([...MOOD_KEYS]);
    });

    it('floats selected moods to the front, remaining moods follow in normal order', () => {
      const order = todaysMoodOrder(['tired', 'calm']);
      expect(order.slice(0, 2)).toEqual(['tired', 'calm']);
      expect(order.slice(2)).toEqual(MOOD_KEYS.filter((k) => k !== 'tired' && k !== 'calm'));
    });

    it('always returns a full permutation of every mood exactly once', () => {
      const order = todaysMoodOrder(['happy', 'sad', 'calm']);
      expect(order).toHaveLength(MOOD_KEYS.length);
      expect(new Set(order)).toEqual(new Set(MOOD_KEYS));
    });

    it('de-duplicates a selected list with repeats/unknowns without dropping moods', () => {
      const order = todaysMoodOrder(['calm', 'calm', 'nope'] as never);
      expect(order.filter((k) => k === 'calm')).toHaveLength(1);
      expect(order).toHaveLength(MOOD_KEYS.length);
      expect(new Set(order)).toEqual(new Set(MOOD_KEYS));
    });
  });
});
