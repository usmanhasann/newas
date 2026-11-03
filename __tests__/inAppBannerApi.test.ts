/**
 * The reads behind a circle banner (client revisions 10/14 p.8), against a fake Supabase client:
 *  - who wrote it (and whether they are verified, N7.15), in which circle, and what they wrote, with
 *    the same fallbacks as the push;
 *  - a deleted post shows no banner;
 *  - a reply's post (to open the right page), and a post that's gone.
 */
import { fetchBannerPost, fetchPostParent } from '@features/notifications/api';

const mockFrom = jest.fn();
jest.mock('@lib', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

/** A PostgREST query builder stand-in: records filters, resolves to `result` on maybeSingle(). */
function query(result: { data?: unknown; error?: unknown }) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) {
    q[m] = (...a: unknown[]) => {
      calls.push([m, a]);
      return q;
    };
  }
  q.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  return { q, calls };
}

const POST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => mockFrom.mockReset());

it('reads the post, its author and its circle', async () => {
  const post = query({
    data: {
      id: POST,
      circle_id: 'c1',
      parent_id: 'root',
      author_id: 'u1',
      body: 'Same here',
      deleted_at: null,
    },
  });
  const author = query({ data: { display_name: ' Auguste ', avatar_url: 'https://a/x.png' } });
  const circle = query({ data: { name: 'Konah’s Friends' } });
  mockFrom.mockImplementation((table: string) =>
    table === 'circle_posts' ? post.q : table === 'profiles' ? author.q : circle.q,
  );

  await expect(fetchBannerPost(POST)).resolves.toEqual({
    id: POST,
    circleId: 'c1',
    parentId: 'root',
    authorId: 'u1',
    authorName: 'Auguste',
    authorVerified: false,
    avatarUrl: 'https://a/x.png',
    circleName: 'Konah’s Friends',
    text: 'Same here',
  });
  expect(post.calls).toContainEqual(['eq', ['id', POST]]);
  expect(author.calls).toContainEqual(['select', ['display_name, avatar_url, verified']]);
  expect(author.calls).toContainEqual(['eq', ['user_id', 'u1']]);
  expect(circle.calls).toContainEqual(['eq', ['id', 'c1']]);
});

it('reads the author’s verified badge live (N7.15), and only a true flag counts', async () => {
  const row = { id: POST, circle_id: 'c1', parent_id: null, author_id: 'u1', body: 'Hi', deleted_at: null };
  const circle = query({ data: { name: 'Circle' } });
  for (const [verified, expected] of [
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
  ] as const) {
    const post = query({ data: row });
    const author = query({ data: { display_name: 'Taylor', avatar_url: null, verified } });
    mockFrom.mockImplementation((table: string) =>
      table === 'circle_posts' ? post.q : table === 'profiles' ? author.q : circle.q,
    );
    await expect(fetchBannerPost(POST)).resolves.toMatchObject({
      authorName: 'Taylor',
      authorVerified: expected,
    });
  }
});

it('falls back like the push does when a name is missing', async () => {
  const post = query({
    data: { id: POST, circle_id: 'c1', parent_id: null, author_id: null, body: null, deleted_at: null },
  });
  const circle = query({ data: { name: '  ' } });
  mockFrom.mockImplementation((table: string) => (table === 'circle_posts' ? post.q : circle.q));

  await expect(fetchBannerPost(POST)).resolves.toMatchObject({
    authorName: 'Someone',
    authorVerified: false,
    circleName: 'your circle',
    text: '',
    avatarUrl: null,
  });
  expect(mockFrom).not.toHaveBeenCalledWith('profiles');
});

it('shows nothing for a deleted post', async () => {
  const post = query({
    data: { id: POST, circle_id: 'c1', parent_id: null, author_id: 'u1', body: 'x', deleted_at: 'now' },
  });
  mockFrom.mockImplementation(() => post.q);
  await expect(fetchBannerPost(POST)).resolves.toBeNull();
});

it('finds the post a reply sits under, and says when a post is gone', async () => {
  mockFrom.mockImplementationOnce(() => query({ data: { parent_id: 'root', deleted_at: null } }).q);
  await expect(fetchPostParent(POST)).resolves.toBe('root');
  mockFrom.mockImplementationOnce(() => query({ data: { parent_id: null, deleted_at: null } }).q);
  await expect(fetchPostParent(POST)).resolves.toBeNull();
  mockFrom.mockImplementationOnce(() => query({ data: null }).q);
  await expect(fetchPostParent(POST)).resolves.toBeUndefined();
  mockFrom.mockImplementationOnce(() => query({ error: { message: 'boom' } }).q);
  await expect(fetchPostParent(POST)).rejects.toEqual({ message: 'boom' });
});
