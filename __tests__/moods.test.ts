import { MOOD_LIST, MOODS, getMood, isMoodKey } from '@theme/moods';

describe('moods', () => {
  it('includes the required `frustrated` mood', () => {
    expect(isMoodKey('frustrated')).toBe(true);
    expect(MOODS.frustrated.label).toBe('Frustrated');
  });

  it('falls back to neutral for unknown / nullish keys', () => {
    expect(getMood('does-not-exist').key).toBe('neutral');
    expect(getMood(null).key).toBe('neutral');
    expect(getMood(undefined).key).toBe('neutral');
  });

  it('every mood defines dot/bg/ink hex colors', () => {
    for (const m of MOOD_LIST) {
      expect(m.dot).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.ink).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('uses non-emoji vector icons, never emoji (§6)', () => {
    for (const m of MOOD_LIST) {
      // A kebab-case Ionicons name, not a Unicode emoji.
      expect(m.icon).toMatch(/^[a-z-]+$/);
      expect(m).not.toHaveProperty('emoji');
    }
    // Icons are unique per mood so the same mood always renders the same glyph.
    const icons = MOOD_LIST.map((m) => m.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
