/**
 * Circle posts data layer — verifies createPost's payload, the heart on/off branches, and that
 * fetchReplies decorates rows with the author profile + the viewer's own heart state. supabase is a
 * chainable mock with per-table canned results.
 */
import {
  createPost,
  setHeart,
  fetchReplies,
  PostBlockedError,
  REPLY_PAGE,
} from '@features/circles/postsApi';

// The pre/post moderation scan is mocked: moderateCircleText decides block vs allow; scanCirclePost
// is the async backstop we assert fires. Default is 'allow' so the plain-insert tests are unaffected.
const mockModerate = jest.fn();
const mockScan = jest.fn();
jest.mock('@features/moderation', () => ({
  moderateCircleText: (...a: unknown[]) => mockModerate(...a),
  scanCirclePost: (...a: unknown[]) => mockScan(...a),
}));

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
      eq: (...a: unknown[]) => rec('eq', ...a),
      in: (...a: unknown[]) => rec('in', ...a),
      order: (...a: unknown[]) => rec('order', ...a),
      or: (...a: unknown[]) => rec('or', ...a),
      limit: (...a: unknown[]) => rec('limit', ...a),
      single: () => term(),
      maybeSingle: () => term(),
      then: (resolve: (r: unknown) => void) => resolve(results[table] ?? { data: null, error: null }),
    };
    return chain;
  };
  return {
    supabase: { from: (t: string) => builder(t) },
    __results: results,
    __calls: calls,
  };
});

const lib = jest.requireMock('@lib') as {
  __results: Record<string, { data: unknown; error: unknown }>;
  __calls: { table: string; op: string; args: unknown[] }[];
};

beforeEach(() => {
  lib.__calls.length = 0;
  for (const k of Object.keys(lib.__results)) delete lib.__results[k];
  mockModerate.mockReset().mockResolvedValue('allow');
  mockScan.mockReset();
});

describe('createPost', () => {
  it('inserts a reply with the trimmed body + parent + author', async () => {
    lib.__results.circle_posts = { data: { id: 'r1' }, error: null };
    await createPost({ circleId: 'c1', parentId: 'p1', body: '  hi there  ', authorId: 'u1' });
    const insert = lib.__calls.find((c) => c.table === 'circle_posts' && c.op === 'insert');
    expect(insert?.args[0]).toEqual({
      circle_id: 'c1',
      parent_id: 'p1',
      body: 'hi there',
      author_id: 'u1',
      mood_slugs: [], // no mood picked
    });
    // A reply is scanned as a comment; the pre-gate saw the trimmed body.
    expect(mockModerate).toHaveBeenCalledWith({ targetType: 'circle_comment', text: 'hi there' });
  });

  it('inserts a top-level post with parent_id null', async () => {
    lib.__results.circle_posts = { data: { id: 't1' }, error: null };
    await createPost({ circleId: 'c1', body: 'a prompt', authorId: 'u1' });
    const insert = lib.__calls.find((c) => c.table === 'circle_posts' && c.op === 'insert');
    expect((insert?.args[0] as { parent_id: unknown }).parent_id).toBeNull();
    expect(mockModerate).toHaveBeenCalledWith({ targetType: 'circle_post', text: 'a prompt' });
  });

  it('fires the async post-scan with the new post id after inserting', async () => {
    lib.__results.circle_posts = { data: { id: 't1' }, error: null };
    await createPost({ circleId: 'c1', body: 'a prompt', authorId: 'u1' });
    expect(mockScan).toHaveBeenCalledWith({ targetType: 'circle_post', targetId: 't1', text: 'a prompt' });
  });

  it('blocks severe content: throws PostBlockedError and never inserts', async () => {
    mockModerate.mockResolvedValue('block');
    lib.__results.circle_posts = { data: { id: 'x' }, error: null };
    await expect(createPost({ circleId: 'c1', body: 'severe', authorId: 'u1' })).rejects.toBeInstanceOf(
      PostBlockedError,
    );
    expect(lib.__calls.some((c) => c.table === 'circle_posts' && c.op === 'insert')).toBe(false);
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe('setHeart', () => {
  it('upserts on the (post,user) key when hearting', async () => {
    lib.__results.post_reactions = { data: null, error: null };
    await setHeart('p1', 'u1', true);
    const upsert = lib.__calls.find((c) => c.table === 'post_reactions' && c.op === 'upsert');
    expect(upsert?.args[0]).toEqual({ post_id: 'p1', user_id: 'u1' });
    expect(upsert?.args[1]).toEqual({ onConflict: 'post_id,user_id' });
  });

  it('deletes the reaction when un-hearting', async () => {
    lib.__results.post_reactions = { data: null, error: null };
    await setHeart('p1', 'u1', false);
    expect(lib.__calls.some((c) => c.table === 'post_reactions' && c.op === 'delete')).toBe(true);
  });
});

describe('fetchReplies — decoration', () => {
  it('attaches the author profile and the viewer’s own heart state', async () => {
    lib.__results.circle_posts = {
      data: [
        { id: 'r1', circle_id: 'c1', author_id: 'a1', parent_id: 'p1', body: 'hey', reply_count: 0, like_count: 1, created_at: 't', deleted_at: null },
        { id: 'r2', circle_id: 'c1', author_id: 'a2', parent_id: 'p1', body: 'yo', reply_count: 0, like_count: 0, created_at: 't', deleted_at: null },
      ],
      error: null,
    };
    lib.__results.profiles = {
      data: [{ user_id: 'a1', display_name: 'Ada', avatar_url: null }],
      error: null,
    };
    lib.__results.post_reactions = { data: [{ post_id: 'r1' }], error: null };

    const { items: replies, nextCursor } = await fetchReplies('p1', 'viewer');
    expect(replies[0]!.author?.display_name).toBe('Ada');
    expect(replies[0]!.liked_by_me).toBe(true); // viewer hearted r1
    expect(replies[1]!.author).toBeNull(); // a2 has no profile row
    expect(replies[1]!.liked_by_me).toBe(false);
    expect(nextCursor).toBeNull(); // fewer than a page: that's all of them
  });

  it('loads a page at a time, oldest first, continuing after a (time, id) cursor', async () => {
    lib.__results.circle_posts = { data: [], error: null };
    await fetchReplies('p1', 'viewer', { created_at: 't5', id: 'r5' });
    expect(lib.__calls.find((c) => c.op === 'or')?.args[0]).toBe(
      'created_at.gt.t5,and(created_at.eq.t5,id.gt.r5)',
    );
    expect(lib.__calls.filter((c) => c.op === 'order').map((c) => c.args)).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(lib.__calls.some((c) => c.op === 'limit' && c.args[0] === REPLY_PAGE)).toBe(true);
  });

  it('looks people up in batches, so a huge page never builds one giant request', async () => {
    const rows = Array.from({ length: REPLY_PAGE }, (_, i) => ({
      id: `r${i}`,
      parent_id: 'p1',
      author_id: `a${i}`,
      mention_user_id: `m${i}`,
      created_at: 't',
    }));
    lib.__results.circle_posts = { data: rows, error: null };
    lib.__results.profiles = { data: [], error: null };
    lib.__results.post_reactions = { data: [], error: null };
    await fetchReplies('p1', 'viewer');
    const lookups = lib.__calls.filter((c) => c.table === 'profiles' && c.op === 'in');
    expect(lookups.every((c) => (c.args[1] as string[]).length <= 200)).toBe(true);
    expect(lookups.flatMap((c) => c.args[1] as string[])).toHaveLength(REPLY_PAGE * 2);
  });

  it('a failed profile lookup fails the load (never shows everyone as "Someone")', async () => {
    lib.__results.circle_posts = {
      data: [{ id: 'r1', parent_id: 'p1', author_id: 'a1', mention_user_id: null, created_at: 't' }],
      error: null,
    };
    lib.__results.profiles = { data: null, error: { message: 'network' } };
    lib.__results.post_reactions = { data: [], error: null };
    await expect(fetchReplies('p1', 'viewer')).rejects.toEqual({ message: 'network' });
  });
});
