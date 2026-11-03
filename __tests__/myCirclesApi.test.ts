/**
 * circles/api for Your Circles order, archiving and join notices (client revisions 10/14 p.2, 9,
 * 23-24), against a fake Supabase client:
 *  - Your Circles is read page by page from my_circles_by_activity (keyset: each page starts after
 *    the last row of the one before), rows checked with Zod; an older server without the function
 *    falls back to the tables, ordered the same way;
 *  - live changes: one channel, circle updates filtered to the user's circles (100 ids per filter),
 *    the user's own membership rows, a reconnect asks for a reload;
 *  - Discover leaves archived circles out; joining an archived circle fails with a clear reason;
 *  - unarchive, and the fire-and-forget notices to send-push.
 */
import {
  CircleArchivedError,
  fetchMyCircles,
  fetchPublicCircles,
  joinByCode,
  joinCircle,
  notifyCircleEvent,
  subscribeToMyCircles,
  unarchiveCircle,
} from '@features/circles/api';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
const mockInvoke = jest.fn();
const mockSetAuth = jest.fn(() => Promise.resolve());
jest.mock('@lib', () => ({
  supabase: {
    realtime: { setAuth: () => mockSetAuth() },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
    channel: (...a: unknown[]) => mockChannel(...a),
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

/** A PostgREST query builder stand-in: records every call, resolves to `result` when awaited. */
function query(result: { data?: unknown; error?: unknown }) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'update', 'upsert']) {
    q[m] = (...a: unknown[]) => {
      calls.push([m, a]);
      return q;
    };
  }
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? null, error: result.error ?? null });
  return { q, calls };
}

const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(1000 - i).padStart(12, '0')}`,
  owner_id: 'u1',
  name: `Circle ${i}`,
  type: 'private',
  invite_code: 'ABC',
  invite_link_slug: null,
  circle_reflection_style: 'personal',
  description: null,
  member_count: 2,
  archived_at: null,
  created_at: '2026-10-01T00:00:00+00:00',
  updated_at: '2026-10-01T00:00:00+00:00',
  last_activity_at: '2026-10-01T00:00:00+00:00',
  role: 'member',
  joined_at: '2026-10-01T00:00:00+00:00',
  activity_at: new Date(Date.UTC(2026, 9, 20) - i * 60_000).toISOString(),
  ...over,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockChannel.mockReset();
  mockRemoveChannel.mockReset();
  mockInvoke.mockReset();
});

describe('fetchMyCircles', () => {
  it('reads every page in order, each starting after the last row of the one before', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => row(i));
    const page2 = [row(100, { archived_at: '2026-10-02T00:00:00+00:00' })];
    mockRpc
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const list = await fetchMyCircles('u2');

    expect(list.map((c) => c.name)).toEqual([...page1, ...page2].map((r) => r.name));
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'my_circles_by_activity', {
      p_limit: 100,
      p_after_archived: null,
      p_after_activity: null,
      p_after_id: null,
    });
    const last = page1[99]!;
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'my_circles_by_activity', {
      p_limit: 100,
      p_after_archived: false,
      p_after_activity: last.activity_at,
      p_after_id: last.id,
    });
    expect(list[0]).toMatchObject({ role: 'member', joined_at: row(0).joined_at, activity_at: row(0).activity_at });
  });

  it('refuses rows that aren’t the expected shape', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ ...row(0), role: 'admin' }], error: null });
    await expect(fetchMyCircles('u2')).rejects.toThrow();
  });

  it('passes other server errors on', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(fetchMyCircles('u2')).rejects.toMatchObject({ code: '42501' });
  });

  it('an older server without the list function: reads the tables and orders them the same way', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const members = query({
      data: [
        { circle_id: 'c1', role: 'owner', approved_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
        { circle_id: 'c2', role: 'member', approved_at: '2026-10-15T00:00:00Z', created_at: '2026-10-15T00:00:00Z' },
        { circle_id: 'c3', role: 'member', approved_at: '2026-10-03T00:00:00Z', created_at: '2026-10-03T00:00:00Z' },
      ],
    });
    const circles = query({
      data: [
        { id: 'c1', name: 'Mine', type: 'private', archived_at: null, created_at: '2026-10-01T00:00:00Z' },
        { id: 'c2', name: 'Joined late', type: 'public', archived_at: null, created_at: '2026-09-01T00:00:00Z' },
        { id: 'c3', name: 'Archived', type: 'private', archived_at: '2026-10-16T00:00:00Z', created_at: '2026-09-01T00:00:00Z' },
      ],
    });
    mockFrom.mockImplementation((t: string) => (t === 'circle_members' ? members.q : circles.q));

    const list = await fetchMyCircles('u2');

    expect(list.map((c) => c.name)).toEqual(['Joined late', 'Mine', 'Archived']);
    expect(list[0]).toMatchObject({ role: 'member', activity_at: '2026-10-15T00:00:00.000Z' });
    expect(members.calls).toEqual(
      expect.arrayContaining([
        ['eq', ['user_id', 'u2']],
        ['eq', ['status', 'approved']],
      ]),
    );
  });
});

describe('Discover and joining', () => {
  it('Discover leaves archived circles out', async () => {
    const pub = query({ data: [] });
    mockFrom.mockReturnValueOnce(pub.q);
    await fetchPublicCircles();
    expect(pub.calls).toEqual(
      expect.arrayContaining([
        ['eq', ['type', 'public']],
        ['is', ['archived_at', null]],
      ]),
    );
  });

  it('an invite code for an archived circle: a clear reason, not a failed connection', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'circle_archived' } });
    const err = await joinByCode('ABC').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CircleArchivedError);
    expect((err as Error).message).toBe('This circle has been archived, so no one new can join.');
  });

  it('joining an archived circle from Discover: the same reason', async () => {
    mockFrom.mockReturnValueOnce(query({ error: { code: 'P0001', message: 'circle_archived' } }).q);
    await expect(joinCircle('c1', 'u2')).rejects.toBeInstanceOf(CircleArchivedError);
  });

  it('other join errors are passed on as they are', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } });
    await expect(joinByCode('ABC')).rejects.not.toBeInstanceOf(CircleArchivedError);
  });
});

describe('archiving notices', () => {
  it('unarchive clears the archive (the server checks the owner)', async () => {
    const upd = query({});
    mockFrom.mockReturnValueOnce(upd.q);
    await unarchiveCircle('c1');
    expect(mockFrom).toHaveBeenCalledWith('circles');
    expect(upd.calls).toEqual([
      ['update', [{ archived_at: null }]],
      ['eq', ['id', 'c1']],
    ]);
  });

  it('notices go to send-push and never throw', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: null });
    await notifyCircleEvent({ type: 'circle_archived', circle_id: 'c1' });
    expect(mockInvoke).toHaveBeenCalledWith('send-push', {
      body: { type: 'circle_archived', circle_id: 'c1' },
    });
    mockInvoke.mockRejectedValueOnce(new Error('offline'));
    await expect(notifyCircleEvent({ type: 'member_joined', circle_id: 'c1' })).resolves.toBeUndefined();
  });
});

describe('subscribeToMyCircles', () => {
  it('one channel: the user’s circles (100 ids per filter) and their own memberships', async () => {
    const ons: [string, Record<string, string>, (p: { new: unknown }) => void][] = [];
    let statusCb: (s: string) => void = () => {};
    const channel = {
      on: (kind: string, filter: Record<string, string>, cb: (p: { new: unknown }) => void) => {
        ons.push([kind, filter, cb]);
        return channel;
      },
      subscribe: (cb: (s: string) => void) => {
        statusCb = cb;
        return channel;
      },
    };
    mockChannel.mockReturnValueOnce(channel);
    const onCircleChange = jest.fn();
    const onMembershipChange = jest.fn();
    const onResubscribed = jest.fn();
    const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);

    const stop = subscribeToMyCircles('u2', ids, { onCircleChange, onMembershipChange, onResubscribed });
    await flush();

    // The session's token goes to Realtime first (each change is checked against the user's access).
    expect(mockSetAuth).toHaveBeenCalled();

    expect(mockChannel).toHaveBeenCalledWith(expect.stringMatching(/^my-circles:u2:\d+$/));
    const circleFilters = ons.filter(([, f]) => f.table === 'circles');
    expect(circleFilters.map(([, f]) => f)).toEqual([
      { event: 'UPDATE', schema: 'public', table: 'circles', filter: `id=in.(${ids.slice(0, 100).join(',')})` },
      { event: 'UPDATE', schema: 'public', table: 'circles', filter: `id=in.(${ids.slice(100).join(',')})` },
    ]);
    const memberFilters = ons.filter(([, f]) => f.table === 'circle_members').map(([, f]) => f);
    expect(memberFilters).toEqual([
      { event: 'INSERT', schema: 'public', table: 'circle_members', filter: 'user_id=eq.u2' },
      { event: 'UPDATE', schema: 'public', table: 'circle_members', filter: 'user_id=eq.u2' },
    ]);

    // A circle changed: only the columns the list uses reach the app; junk is ignored.
    circleFilters[0]![2]({ new: { id: 'id1', last_activity_at: '2026-10-20T09:00:00+00:00', archived_at: null, invite_code: 'X' } });
    expect(onCircleChange).toHaveBeenCalledWith({
      id: 'id1',
      last_activity_at: '2026-10-20T09:00:00+00:00',
      archived_at: null,
    });
    circleFilters[0]![2]({ new: { nope: true } });
    expect(onCircleChange).toHaveBeenCalledTimes(1);

    ons.find(([, f]) => f.table === 'circle_members')![2]({ new: {} });
    expect(onMembershipChange).toHaveBeenCalledTimes(1);

    // The first connection is not a reconnect; a later one asks for a reload.
    statusCb('SUBSCRIBED');
    expect(onResubscribed).not.toHaveBeenCalled();
    statusCb('CHANNEL_ERROR');
    statusCb('SUBSCRIBED');
    expect(onResubscribed).toHaveBeenCalledTimes(1);

    stop();
    await flush();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
  });

  it('stopped before it was ready: nothing is opened', async () => {
    const stop = subscribeToMyCircles('u2', ['a'], {
      onCircleChange: jest.fn(),
      onMembershipChange: jest.fn(),
      onResubscribed: jest.fn(),
    });
    stop();
    await flush();
    expect(mockChannel).not.toHaveBeenCalled();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });
});
