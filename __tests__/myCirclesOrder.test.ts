/**
 * YOUR CIRCLES order (client revisions 10/14 p.2): most recent activity first; joining or creating
 * counts as activity for that person; archived circles always below every active circle, most
 * recent activity first among themselves; a live change (new post or reply, archived, unarchived)
 * moves the circle at once. Mirrors my_circles_by_activity's ORDER BY (archived, activity desc, id desc).
 */
import {
  activityFor,
  applyCircleChange,
  compareMyCircles,
  sortMyCircles,
  type OrderedCircle,
} from '@features/circles/myCirclesOrder';

const c = (
  id: string,
  activity: string,
  archived: string | null = null,
  joined: string | null = '2026-10-01T00:00:00.000Z',
): OrderedCircle => ({ id, activity_at: activity, archived_at: archived, joined_at: joined });

const ids = (list: readonly OrderedCircle[]) => list.map((x) => x.id);

describe('sortMyCircles', () => {
  it('most recently active first', () => {
    const list = [
      c('a', '2026-10-10T08:00:00.000Z'),
      c('b', '2026-10-12T08:00:00.000Z'),
      c('c', '2026-10-11T08:00:00.000Z'),
    ];
    expect(ids(sortMyCircles(list))).toEqual(['b', 'c', 'a']);
  });

  it('archived always below every active circle, newest activity first among themselves', () => {
    const list = [
      c('old-archived', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
      c('new-archived', '2026-10-20T00:00:00.000Z', '2026-10-20T01:00:00.000Z'),
      c('quiet', '2026-08-01T00:00:00.000Z'),
      c('busy', '2026-10-19T00:00:00.000Z'),
    ];
    expect(ids(sortMyCircles(list))).toEqual(['busy', 'quiet', 'new-archived', 'old-archived']);
  });

  it('a tie in activity goes by id, larger first (as the server orders it)', () => {
    const t = '2026-10-10T08:00:00.000Z';
    expect(ids(sortMyCircles([c('a1', t), c('b2', t), c('a9', t)]))).toEqual(['b2', 'a9', 'a1']);
    expect(compareMyCircles(c('x', t), c('x', t))).toBe(0);
  });

  it('does not change the list it was given', () => {
    const list = [c('a', '2026-10-10T08:00:00.000Z'), c('b', '2026-10-12T08:00:00.000Z')];
    sortMyCircles(list);
    expect(ids(list)).toEqual(['a', 'b']);
  });
});

describe('activityFor', () => {
  it('joining or creating counts as activity: the newer of the two wins', () => {
    expect(activityFor('2026-10-01T00:00:00.000Z', '2026-10-05T00:00:00.000Z')).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(activityFor('2026-10-09T00:00:00.000Z', '2026-10-05T00:00:00.000Z')).toBe(
      '2026-10-09T00:00:00.000Z',
    );
  });

  it('reads the server’s microsecond timestamps', () => {
    expect(activityFor('2026-10-09T10:00:00.123456+00:00', null)).toBe('2026-10-09T10:00:00.123Z');
  });
});

describe('applyCircleChange (live)', () => {
  const list = sortMyCircles([
    c('a', '2026-10-12T08:00:00.000Z'),
    c('b', '2026-10-11T08:00:00.000Z'),
    c('c', '2026-10-10T08:00:00.000Z'),
    c('z', '2026-10-01T08:00:00.000Z', '2026-10-02T00:00:00.000Z'),
  ]);

  it('a new post or reply in a circle moves it to the top', () => {
    const next = applyCircleChange(list, { id: 'c', last_activity_at: '2026-10-20T09:00:00.000Z' });
    expect(ids(next)).toEqual(['c', 'a', 'b', 'z']);
    expect(next[0]!.activity_at).toBe('2026-10-20T09:00:00.000Z');
  });

  it('archiving moves it to the bottom at once; unarchiving puts it back by its activity', () => {
    const archived = applyCircleChange(list, { id: 'a', archived_at: '2026-10-20T09:00:00.000Z' });
    expect(ids(archived)).toEqual(['b', 'c', 'a', 'z']);
    const back = applyCircleChange(archived, { id: 'a', archived_at: null });
    expect(ids(back)).toEqual(['a', 'b', 'c', 'z']);
  });

  it('an archived circle’s activity still orders it among the archived ones', () => {
    const next = applyCircleChange(list, { id: 'b', archived_at: '2026-10-20T09:00:00.000Z' });
    expect(ids(next)).toEqual(['a', 'c', 'b', 'z']);
  });

  it('a change that isn’t newer never moves a circle down (activity only moves forward)', () => {
    const next = applyCircleChange(list, { id: 'a', last_activity_at: '2026-01-01T00:00:00.000Z' });
    expect(ids(next)).toEqual(['a', 'b', 'c', 'z']);
    expect(next[0]!.activity_at).toBe('2026-10-12T08:00:00.000Z');
  });

  it('keeps the person’s join time in the picture (joined after the circle’s last post)', () => {
    const joinedLate = [c('j', '2026-10-15T00:00:00.000Z', null, '2026-10-15T00:00:00.000Z')];
    const next = applyCircleChange(joinedLate, { id: 'j', last_activity_at: '2026-10-14T00:00:00.000Z' });
    expect(next[0]!.activity_at).toBe('2026-10-15T00:00:00.000Z');
  });

  it('updates the name and member count shown, and ignores circles not in the list', () => {
    const named = [{ ...c('a', '2026-10-12T08:00:00.000Z'), name: 'Old', member_count: 2 }];
    const next = applyCircleChange(named, { id: 'a', name: 'New', member_count: 3 });
    expect(next[0]).toMatchObject({ name: 'New', member_count: 3 });
    expect(applyCircleChange(list, { id: 'nope', archived_at: '2026-10-20T09:00:00.000Z' })).toEqual(list);
  });
});
