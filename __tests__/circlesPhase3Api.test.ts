/**
 * Circles Phase 3 data layer — open-join, ban (records + removes membership), public discovery, the
 * creator-only vs all feed filter (one feed: posts and shared entries), and each circle’s own notification switches. supabase is a
 * chainable per-table mock.
 *
 * The mock client has no `rpc` on purpose: loading the circles API must never touch the client (it
 * once bound `supabase.rpc` at import, so this whole file failed to load). An RPC is looked up only
 * when one is called (the last test).
 */
import {
  joinCircle,
  banFromCircle,
  fetchPublicCircles,
  fetchMyCircles,
  fetchCircleNotificationPrefs,
  updateCircleNotificationPrefs,
  CircleArchivedError,
} from '@features/circles/api';
import { fetchFeedPage } from '@features/circles/postsApi';

jest.mock('@lib', () => {
  const results: Record<string, { data: unknown; error: unknown }> = {};
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    const rec = (op: string, ...a: unknown[]) => {
      calls.push({ table, op, args: a });
      return chain;
    };
    const term = () => Promise.resolve(results[table] ?? { data: null, error: null });
    const chain: Record<string, unknown> = {
      select: (...a: unknown[]) => rec('select', ...a),
      insert: (...a: unknown[]) => rec('insert', ...a),
      upsert: (...a: unknown[]) => rec('upsert', ...a),
      delete: (...a: unknown[]) => rec('delete', ...a),
      update: (...a: unknown[]) => rec('update', ...a),
      eq: (...a: unknown[]) => rec('eq', ...a),
      is: (...a: unknown[]) => rec('is', ...a),
      in: (...a: unknown[]) => rec('in', ...a),
      order: (...a: unknown[]) => rec('order', ...a),
      lt: (...a: unknown[]) => rec('lt', ...a),
      or: (...a: unknown[]) => rec('or', ...a),
      limit: (...a: unknown[]) => rec('limit', ...a),
      single: () => term(),
      maybeSingle: () => term(),
      then: (resolve: (r: unknown) => void) => resolve(results[table] ?? { data: [], error: null }),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => builder(t) }, __results: results, __calls: calls };
});

const lib = jest.requireMock('@lib') as {
  supabase: Record<string, unknown>;
  __results: Record<string, { data: unknown; error: unknown }>;
  __calls: { table: string; op: string; args: unknown[] }[];
};

beforeEach(() => {
  lib.__calls.length = 0;
  for (const k of Object.keys(lib.__results)) delete lib.__results[k];
  delete lib.supabase.rpc;
});

describe('joinCircle — open-join', () => {
  it('upserts an approved membership on the (circle,user) key', async () => {
    await joinCircle('c1', 'u1');
    const upsert = lib.__calls.find((c) => c.table === 'circle_members' && c.op === 'upsert');
    expect(upsert?.args[0]).toEqual({ circle_id: 'c1', user_id: 'u1', status: 'approved', role: 'member' });
    expect(upsert?.args[1]).toEqual({ onConflict: 'circle_id,user_id' });
  });

  it('an archived circle refuses the join with the reason people are shown', async () => {
    lib.__results.circle_members = {
      data: null,
      error: { message: 'circle_archived', code: 'P0001' },
    };
    const err = await joinCircle('c1', 'u1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CircleArchivedError);
    expect((err as Error).message).toBe('This circle has been archived, so no one new can join.');
  });
});

describe('banFromCircle — a real ban', () => {
  it('records the ban AND removes the membership (so they can’t rejoin)', async () => {
    await banFromCircle('c1', 'target', 'owner1');
    const ban = lib.__calls.find((c) => c.table === 'circle_bans' && c.op === 'upsert');
    expect(ban?.args[0]).toEqual({ circle_id: 'c1', user_id: 'target', banned_by: 'owner1' });
    expect(lib.__calls.some((c) => c.table === 'circle_members' && c.op === 'delete')).toBe(true);
  });
});

describe('fetchPublicCircles', () => {
  it('queries public circles ordered by member_count desc', async () => {
    lib.__results.circles = { data: [{ id: 'c1', member_count: 5 }], error: null };
    await fetchPublicCircles();
    expect(lib.__calls.some((c) => c.table === 'circles' && c.op === 'eq' && c.args[0] === 'type' && c.args[1] === 'public')).toBe(true);
    expect(lib.__calls.some((c) => c.op === 'order' && c.args[0] === 'member_count')).toBe(true);
  });

  it('leaves archived circles out of Discover (client 10/14 p.23)', async () => {
    lib.__results.circles = { data: [], error: null };
    await fetchPublicCircles();
    expect(
      lib.__calls.some((c) => c.table === 'circles' && c.op === 'is' && c.args[0] === 'archived_at' && c.args[1] === null),
    ).toBe(true);
  });
});

describe('fetchFeedPage — the one feed', () => {
  it('Public: only the creator’s top-level prompts, newest first, a page at a time', async () => {
    lib.__results.circle_posts = { data: [], error: null };
    await fetchFeedPage('c1', 'viewer', { creatorOnly: 'owner1', limit: 5 });
    expect(lib.__calls.some((c) => c.op === 'is' && c.args[0] === 'parent_id')).toBe(true); // top-level only
    expect(lib.__calls.some((c) => c.op === 'eq' && c.args[0] === 'author_id' && c.args[1] === 'owner1')).toBe(true);
    expect(lib.__calls.some((c) => c.op === 'order' && c.args[0] === 'created_at')).toBe(true);
    expect(lib.__calls.some((c) => c.op === 'limit' && c.args[0] === 5)).toBe(true);
  });

  it('Private: everyone’s posts and shared entries, continuing after a (time, id) cursor', async () => {
    lib.__results.circle_posts = { data: [], error: null };
    const page = await fetchFeedPage('c1', 'viewer', {
      cursor: { created_at: '2026-09-29T10:00:00Z', id: 'p9' },
    });
    expect(lib.__calls.some((c) => c.op === 'eq' && c.args[0] === 'author_id')).toBe(false);
    // Posts sharing the boundary timestamp are continued by id, never skipped (audit 2026-09-30).
    expect(lib.__calls.find((c) => c.op === 'or')?.args[0]).toBe(
      'created_at.lt.2026-09-29T10:00:00Z,and(created_at.eq.2026-09-29T10:00:00Z,id.lt.p9)',
    );
    const orders = lib.__calls.filter((c) => c.op === 'order').map((c) => c.args[0]);
    expect(orders).toEqual(['created_at', 'id']);
    expect(lib.__calls.some((c) => c.op === 'limit' && c.args[0] === 20)).toBe(true);
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('a full page hands back the last row’s time and id as the next cursor', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      author_id: null,
      mention_user_id: null,
      created_at: '2026-09-29T10:00:00Z',
    }));
    lib.__results.circle_posts = { data: rows, error: null };
    lib.__results.post_reactions = { data: [], error: null };
    const page = await fetchFeedPage('c1', 'viewer');
    expect(page.nextCursor).toEqual({ created_at: '2026-09-29T10:00:00Z', id: 'p19' });
  });
});

describe('each circle’s own notification switches', () => {
  it('reads every switch as ON when nothing is saved, and keeps saved values', async () => {
    lib.__results.circle_notification_prefs = { data: null, error: null };
    expect(await fetchCircleNotificationPrefs('c1', 'u1')).toEqual({
      replies: true,
      reactions: true,
      new_prompts: true,
      new_posts: true,
      new_entries: true,
      join_requests: true,
      new_members: true, // the owner's "New members" switch (client 10/14 p.9)
    });
    lib.__results.circle_notification_prefs = {
      data: { replies: true, reactions: false, new_prompts: true },
      error: null,
    };
    const saved = await fetchCircleNotificationPrefs('c1', 'u1');
    expect(saved.reactions).toBe(false);
    expect(saved.replies).toBe(true);
    expect(saved.new_posts).toBe(true); // not saved → the ON default
  });

  it('saves only the changed switch, for this person + circle (upsert on user_id,circle_id)', async () => {
    lib.__results.circle_notification_prefs = { data: null, error: null };
    await updateCircleNotificationPrefs('c1', 'u1', { replies: false });
    const call = lib.__calls.find((c) => c.table === 'circle_notification_prefs' && c.op === 'upsert');
    expect(call?.args).toEqual([
      { user_id: 'u1', circle_id: 'c1', replies: false },
      { onConflict: 'user_id,circle_id' },
    ]);
  });

  it('surfaces a save error instead of swallowing it', async () => {
    lib.__results.circle_notification_prefs = { data: null, error: new Error('rls') };
    await expect(updateCircleNotificationPrefs('c1', 'u1', { replies: false })).rejects.toThrow('rls');
  });
});

describe('RPCs are looked up when called, not when the module loads', () => {
  it('uses the client’s rpc as it is at call time, on the client itself', async () => {
    const seen: { self: unknown; fn: string; args: unknown }[] = [];
    lib.supabase.rpc = function (this: unknown, fn: string, args: unknown) {
      seen.push({ self: this, fn, args });
      return Promise.resolve({ data: [], error: null });
    };
    await expect(fetchMyCircles('u1')).resolves.toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.fn).toBe('my_circles_by_activity');
    expect(seen[0]!.self).toBe(lib.supabase); // still bound to the client
  });
});
