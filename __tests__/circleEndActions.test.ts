/**
 * Circle settings: the archive and delete buttons the owner gets.
 *  - Client revisions 10/14 p.23: Archive for Public circles too, next to "Delete circle", and once
 *    a circle (Public or Private) is archived, "Archive circle" becomes "Unarchive circle".
 *  - Client spec 2026-09-29 (unchanged): Private can be deleted at any size; Public only while it
 *    has fewer than 5 members. The server (delete_circle) re-checks the size rule.
 */
import { circleEndActions, PUBLIC_CIRCLE_DELETE_LIMIT } from '@features/circles/postingLogic';

const ends = (circleType: 'public' | 'private', memberCount: number, archived = false) =>
  circleEndActions({ circleType, memberCount, archived });

describe('circleEndActions', () => {
  it('a Public circle can be deleted only below 5 members (the owner counts)', () => {
    expect(PUBLIC_CIRCLE_DELETE_LIMIT).toBe(5);
  });

  it('Private: Archive and Delete, whatever the size', () => {
    for (const n of [1, 2, 4, 5, 6, 40]) {
      expect(ends('private', n)).toEqual({ archive: true, unarchive: false, delete: true });
    }
  });

  it('Private, archived: Unarchive in place of Archive, and Delete', () => {
    expect(ends('private', 8, true)).toEqual({ archive: false, unarchive: true, delete: true });
  });

  it('Public under 5 members: Archive next to Delete', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(ends('public', n)).toEqual({ archive: true, unarchive: false, delete: true });
    }
  });

  it('Public at 5 or more: Archive only (Delete disappears as it grows)', () => {
    for (const n of [5, 6, 120]) {
      expect(ends('public', n)).toEqual({ archive: true, unarchive: false, delete: false });
    }
  });

  it('Public, archived: Unarchive; Delete too while it has fewer than 5 members', () => {
    expect(ends('public', 5, true)).toEqual({ archive: false, unarchive: true, delete: false });
    expect(ends('public', 3, true)).toEqual({ archive: false, unarchive: true, delete: true });
  });

  it('never offers Archive and Unarchive together, and always offers exactly one of them', () => {
    for (const type of ['public', 'private'] as const) {
      for (const n of [0, 1, 4, 5, 9]) {
        for (const archived of [false, true]) {
          const e = ends(type, n, archived);
          expect(e.archive).toBe(!archived);
          expect(e.unarchive).toBe(archived);
        }
      }
    }
  });
});
