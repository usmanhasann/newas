/**
 * The order of YOUR CIRCLES (client revisions 10/14, p.2): most recent activity first, archived
 * circles always below every active one (most recent activity first among themselves too).
 *
 * A circle's activity, for this person, is the newer of its last post or reply (from anyone,
 * them included; Public prompts and Private shared entries are posts) and when they joined or
 * created it. The server sends the list in this order (my_circles_by_activity); these pure helpers
 * keep it in the same order when a live change arrives, so the two always agree.
 */

export interface OrderedCircle {
  id: string;
  archived_at: string | null;
  /** When this person joined (or created) the circle. */
  joined_at: string | null;
  /** The circle's place in the list: max(its last post or reply, joined_at). */
  activity_at: string;
}

const time = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

/** The server's order: active before archived, newest activity first, then the larger id first. */
export function compareMyCircles(a: OrderedCircle, b: OrderedCircle): number {
  const archived = Number(!!a.archived_at) - Number(!!b.archived_at);
  if (archived !== 0) return archived;
  const activity = time(b.activity_at) - time(a.activity_at);
  if (activity !== 0) return activity;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function sortMyCircles<T extends OrderedCircle>(circles: readonly T[]): T[] {
  return [...circles].sort(compareMyCircles);
}

/** The person's activity for a circle: the newer of its last activity and when they joined. */
export function activityFor(lastActivityAt: string | null | undefined, joinedAt: string | null): string {
  const last = time(lastActivityAt);
  const joined = time(joinedAt);
  if (last === -Infinity && joined === -Infinity) return new Date(0).toISOString();
  return new Date(Math.max(last, joined)).toISOString();
}

/** What a live change to a circle row carries (the columns the list shows or sorts by). */
export interface CircleRowChange {
  id: string;
  name?: string;
  description?: string | null;
  member_count?: number;
  archived_at?: string | null;
  last_activity_at?: string | null;
  owner_id?: string | null;
}

/**
 * A circle the person is in just changed (new post or reply, archived or unarchived, renamed, ...):
 * update it and put the list back in order. A circle that isn't in the list is ignored.
 */
export function applyCircleChange<T extends OrderedCircle>(
  circles: readonly T[],
  change: CircleRowChange,
): T[] {
  const i = circles.findIndex((c) => c.id === change.id);
  if (i < 0) return [...circles];
  const before = circles[i]!;
  const after: T = { ...before };
  if (change.name !== undefined) (after as { name?: string }).name = change.name;
  if (change.description !== undefined) {
    (after as { description?: string | null }).description = change.description;
  }
  if (change.member_count !== undefined) {
    (after as { member_count?: number }).member_count = change.member_count;
  }
  if (change.owner_id !== undefined) (after as { owner_id?: string | null }).owner_id = change.owner_id;
  if (change.archived_at !== undefined) after.archived_at = change.archived_at;
  if (change.last_activity_at) {
    const next = activityFor(change.last_activity_at, before.joined_at);
    // Activity only ever moves forward.
    if (time(next) > time(before.activity_at)) after.activity_at = next;
  }
  const out = [...circles];
  out[i] = after;
  return sortMyCircles(out);
}
