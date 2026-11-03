/**
 * Circle posts data layer for the one feed (client spec 2026-09-29): posts carry optional moods;
 * sharing an entry goes through share_entry with the chosen version; sharing the words "as
 * written" passes the same moderation as a post (blocked → nothing shared) and every post showing
 * the text is scanned; the AI reflection is our own text, so it isn't gated.
 */
import {
  createPost,
  shareEntry,
  fetchEntryShares,
  PostBlockedError,
} from '@features/circles/postsApi';

const mockModerate = jest.fn((_i: unknown) => Promise.resolve('allow'));
const mockScan = jest.fn();
jest.mock('@features/moderation', () => ({
  moderateCircleText: (i: unknown) => mockModerate(i),
  scanCirclePost: (i: unknown) => mockScan(i),
}));

jest.mock('@lib', () => {
  const state = {
    calls: [] as { table: string; op: string; args: unknown[] }[],
    rows: [] as unknown[],
    /** What get_entry_shares returns (every circle the entry is in). */
    shares: [] as unknown[],
  };
  const builder = (table: string) => {
    const rec = (op: string, ...a: unknown[]) => {
      state.calls.push({ table, op, args: a });
      return chain;
    };
    const chain: Record<string, unknown> = {
      insert: (...a: unknown[]) => rec('insert', ...a),
      select: (...a: unknown[]) => rec('select', ...a),
      eq: (...a: unknown[]) => rec('eq', ...a),
      single: () => Promise.resolve({ data: { id: 'new-post' }, error: null }),
      then: (resolve: (r: unknown) => void) => resolve({ data: state.rows, error: null }),
    };
    return chain;
  };
  const rpc = jest.fn((fn: string, ..._a: unknown[]) =>
    Promise.resolve(
      fn === 'get_entry_shares'
        ? { data: state.shares, error: null }
        : { data: [{ circle_id: 'c1', post_id: 'p-new' }], error: null },
    ),
  );
  return { supabase: { from: (t: string) => builder(t), rpc }, __state: state };
});

const lib = jest.requireMock('@lib') as {
  supabase: { rpc: jest.Mock };
  __state: {
    calls: { table: string; op: string; args: unknown[] }[];
    rows: unknown[];
    shares: unknown[];
  };
};

const shareRow = (post: string, circle: string, name: string, replies = 0) => ({
  post_id: post,
  circle_id: circle,
  circle_name: name,
  entry_version: 'written',
  reply_total: replies,
});

beforeEach(() => {
  lib.__state.calls.length = 0;
  lib.__state.rows = [];
  lib.__state.shares = [];
  lib.supabase.rpc.mockClear();
  mockModerate.mockReset().mockResolvedValue('allow');
  mockScan.mockClear();
});

it('a post or reply carries its optional moods', async () => {
  await createPost({ circleId: 'c1', parentId: 'p0', body: ' Me too ', authorId: 'u1', moodSlugs: ['anxious'] });
  const insert = lib.__state.calls.find((c) => c.table === 'circle_posts' && c.op === 'insert');
  expect(insert?.args[0]).toEqual({
    circle_id: 'c1',
    parent_id: 'p0',
    body: 'Me too',
    author_id: 'u1',
    mood_slugs: ['anxious'],
  });
});

it('shares the AI reflection through share_entry, with no text gate', async () => {
  const created = await shareEntry({ entryId: 'e1', circleIds: ['c1'], version: 'reflection', note: 'raw words' });
  expect(mockModerate).not.toHaveBeenCalled();
  expect(lib.supabase.rpc).toHaveBeenCalledWith('share_entry', {
    p_entry: 'e1',
    p_circles: ['c1'],
    p_version: 'reflection',
  });
  expect(created).toEqual([{ circle_id: 'c1', post_id: 'p-new' }]);
  expect(mockScan).not.toHaveBeenCalled();
});

it('"as written" is moderated first, then every post showing it is scanned', async () => {
  lib.__state.shares = [shareRow('p-new', 'c1', 'Family'), shareRow('p-old', 'c2', 'Roommates')];
  await shareEntry({ entryId: 'e1', circleIds: ['c1', 'c2'], version: 'written', note: 'My words.' });
  expect(mockModerate).toHaveBeenCalledWith({ targetType: 'circle_post', text: 'My words.' });
  expect(mockScan.mock.calls.map((c) => (c[0] as { targetId: string }).targetId)).toEqual(['p-new', 'p-old']);
});

it('blocked words are never shared', async () => {
  mockModerate.mockResolvedValue('block');
  await expect(
    shareEntry({ entryId: 'e1', circleIds: ['c1'], version: 'written', note: 'bad' }),
  ).rejects.toBeInstanceOf(PostBlockedError);
  expect(lib.supabase.rpc).not.toHaveBeenCalled();
});

it('un-sharing (no circles) needs no moderation', async () => {
  await shareEntry({ entryId: 'e1', circleIds: [], version: 'written', note: 'x' });
  expect(mockModerate).not.toHaveBeenCalled();
  expect(lib.supabase.rpc).toHaveBeenCalledWith('share_entry', {
    p_entry: 'e1',
    p_circles: [],
    p_version: 'written',
  });
});

it('reads where an entry is shared (incl. circles left since), with names and reply counts', async () => {
  lib.__state.shares = [shareRow('p1', 'c1', 'Family', 3), shareRow('p2', 'c2', 'Old Roommates')];
  expect(await fetchEntryShares('e1')).toEqual({
    circleIds: ['c1', 'c2'],
    version: 'written',
    postIds: ['p1', 'p2'],
    circles: [
      { postId: 'p1', circleId: 'c1', circleName: 'Family', replyTotal: 3 },
      { postId: 'p2', circleId: 'c2', circleName: 'Old Roommates', replyTotal: 0 },
    ],
  });
  // Author-scoped server function (a direct read would miss circles the author has left).
  expect(lib.supabase.rpc).toHaveBeenCalledWith('get_entry_shares', { p_entry: 'e1' });
});
