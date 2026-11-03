/**
 * Home-screen widget rules (client spec 2026-09-29): 24-hour cutoff, "4 or fewer → everyone gets a
 * slot (blank when nothing recent) / 5 or more → the 4 most recent, one per person", newest first,
 * relative time labels, and the initial shown when there's no photo.
 */
import {
  initialOf,
  isRecent,
  relativeTime,
  widgetRows,
  type WidgetMember,
} from '@features/widget/layout';

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const MIN = 60_000;
const HR = 60 * MIN;
const m = (id: string, name: string, agoMs: number | null, moods = ['Calm']): WidgetMember => ({
  id,
  name,
  avatar: null,
  moods,
  at: agoMs === null ? null : NOW - agoMs,
});

describe('relativeTime', () => {
  it('reads like the spec: Just now → min → 1 hr → N hrs', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('Just now');
    expect(relativeTime(NOW - 1 * MIN, NOW)).toBe('1 min');
    expect(relativeTime(NOW - 59 * MIN, NOW)).toBe('59 min');
    expect(relativeTime(NOW - 60 * MIN, NOW)).toBe('1 hr');
    expect(relativeTime(NOW - 119 * MIN, NOW)).toBe('1 hr');
    expect(relativeTime(NOW - 3 * HR, NOW)).toBe('3 hrs');
    expect(relativeTime(NOW - 23 * HR - 59 * MIN, NOW)).toBe('23 hrs');
  });

  it('treats a slightly-future timestamp (clock skew) as just now', () => {
    expect(relativeTime(NOW + 30_000, NOW)).toBe('Just now');
  });
});

describe('isRecent (24-hour cutoff)', () => {
  it('keeps a mood until it is 24 hours old, then drops it', () => {
    expect(isRecent(NOW - 23 * HR, NOW)).toBe(true);
    expect(isRecent(NOW - 24 * HR + 1, NOW)).toBe(true);
    expect(isRecent(NOW - 24 * HR, NOW)).toBe(false);
    expect(isRecent(null, NOW)).toBe(false);
  });
});

describe('widgetRows — 4 or fewer members', () => {
  it('everyone gets a slot; newest first; nothing recent → blank (no stale mood, no time)', () => {
    const rows = widgetRows(
      [m('b', 'Ben', 3 * HR, ['Tired']), m('c', 'Cal', null), m('a', 'Ava', 1 * HR, ['Angry', 'Sad']), m('d', 'Dee', 30 * HR)],
      4,
      NOW,
    );
    expect(rows.map((r) => r.name)).toEqual(['Ava', 'Ben', 'Cal', 'Dee']);
    expect(rows[0]).toMatchObject({ moods: ['Angry', 'Sad'], time: '1 hr' });
    expect(rows[1]).toMatchObject({ moods: ['Tired'], time: '3 hrs' });
    expect(rows[2]).toMatchObject({ moods: [], time: null }); // never posted
    expect(rows[3]).toMatchObject({ moods: [], time: null }); // 30 h old → blank, not stale
  });

  it('a mood disappears from its slot once it turns 24 hours old', () => {
    const members = [m('a', 'Ava', 23 * HR + 50 * MIN)];
    expect(widgetRows(members, 1, NOW)[0]!.moods).toEqual(['Calm']);
    expect(widgetRows(members, 1, NOW + 10 * MIN)[0]).toMatchObject({ moods: [], time: null });
  });
});

describe('widgetRows — 5 or more members', () => {
  it('only the 4 most recent, one per person, newest first; old ones never shown', () => {
    const rows = widgetRows(
      [
        m('a', 'Ava', 5 * HR),
        m('b', 'Ben', 10 * MIN),
        m('c', 'Cal', 2 * HR),
        m('d', 'Dee', 30 * MIN),
        m('e', 'Eve', 20 * HR),
        m('f', 'Fay', 26 * HR),
      ],
      7,
      NOW,
    );
    expect(rows.map((r) => r.name)).toEqual(['Ben', 'Dee', 'Cal', 'Ava']);
    expect(rows.every((r) => r.time !== null)).toBe(true);
  });

  it('fewer than 4 recent → fewer rows (no blanks padding a big circle)', () => {
    const rows = widgetRows([m('a', 'Ava', 1 * HR), m('b', 'Ben', 30 * HR)], 9, NOW);
    expect(rows.map((r) => r.name)).toEqual(['Ava']);
  });
});

describe('initialOf', () => {
  it('first letter, upper-cased; "?" when empty', () => {
    expect(initialOf('konah Quittman')).toBe('K');
    expect(initialOf('  augie')).toBe('A');
    expect(initialOf('')).toBe('?');
    expect(initialOf('Émile')).toBe('É');
  });
});
