/**
 * Live circles (client revisions 10/14 p.7, N1): the pure parts. A burst of signals merges into one
 * plan; cached lists are patched in place (counts, deletions, edits, new posts in order, preview
 * windows keep their size, a Public prompts list only takes the creator's posts); and a list being
 * read further down holds new posts back for the "New posts" button.
 */
import {
  AWAY_FROM_TOP,
  compareFeed,
  feedKeyInfo,
  heldFeedView,
  insertIntoFeed,
  isAwayFromTop,
  mapCachedPosts,
  planLiveBatch,
  queryInCircle,
} from '@features/circles/liveFeed';
import { LivePostSignalSchema, type LivePostSignal } from '@features/circles/liveApi';
import type { PostWithAuthor } from '@features/circles/postsApi';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = id(1);
const P2 = id(2);
const P3 = id(3);
const R1 = id(11);

const post = (pid: string, minute: number, over: Partial<PostWithAuthor> = {}): PostWithAuthor => ({
  id: pid,
  circle_id: 'c1',
  author_id: 'u1',
  parent_id: null,
  body: `post ${pid.slice(-2)}`,
  reply_count: 0,
  like_count: 0,
  created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00.000000+00:00`,
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  thread_created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00.000000+00:00`,
  author: null,
  mention: null,
  liked_by_me: false,
  ...over,
});

const signal = (over: Partial<LivePostSignal>): LivePostSignal => ({
  op: 'update',
  post_id: P1,
  parent_id: null,
  like_count: 0,
  reply_count: 0,
  edited: false,
  ...over,
});

describe('signals', () => {
  it('accepts the server shape and rejects anything else', () => {
    expect(LivePostSignalSchema.safeParse(signal({ op: 'insert' })).success).toBe(true);
    expect(LivePostSignalSchema.safeParse({ ...signal({}), op: 'drop' }).success).toBe(false);
    expect(LivePostSignalSchema.safeParse({ ...signal({}), post_id: 'nope' }).success).toBe(false);
    expect(LivePostSignalSchema.safeParse({ ...signal({}), like_count: -1 }).success).toBe(false);
    expect(LivePostSignalSchema.safeParse({ op: 'insert' }).success).toBe(false);
  });

  it('merges a burst into one plan, latest wins', () => {
    const plan = planLiveBatch([
      signal({ op: 'insert', post_id: P1 }),
      signal({ op: 'update', post_id: P1, like_count: 2, edited: true }),
      signal({ op: 'insert', post_id: R1, parent_id: P2 }),
      signal({ op: 'update', post_id: P2, reply_count: 1 }),
      signal({ op: 'update', post_id: P3, like_count: 5 }),
      signal({ op: 'delete', post_id: P3 }),
      signal({ op: 'update', post_id: id(4), edited: true }),
    ]);
    expect(plan.newPosts).toEqual([P1]);
    // A new post is loaded whole, so it isn't also "edited".
    expect(plan.edited).toEqual([id(4)]);
    expect(plan.newReplyParents).toEqual([P2]);
    expect(plan.counts.get(P1)).toEqual({ like_count: 2, reply_count: 0 });
    expect(plan.counts.get(P2)).toEqual({ like_count: 0, reply_count: 1 });
    // Deleted after an update: only the deletion counts.
    expect(plan.counts.has(P3)).toBe(false);
    expect(plan.removed.get(P3)).toBeNull();
  });

  it('a post deleted in the same burst takes its new replies with it', () => {
    const plan = planLiveBatch([
      signal({ op: 'insert', post_id: R1, parent_id: P1 }),
      signal({ op: 'delete', post_id: P1 }),
    ]);
    expect(plan.newReplyParents).toEqual([]);
    expect(plan.removed.has(P1)).toBe(true);
  });

  it('a post that comes back after a delete is shown again', () => {
    const plan = planLiveBatch([signal({ op: 'delete', post_id: P1 }), signal({ op: 'insert', post_id: P1 })]);
    expect(plan.removed.size).toBe(0);
    expect(plan.newPosts).toEqual([P1]);
  });
});

describe('patching cached posts in place', () => {
  const page = { items: [post(P2, 2), post(P1, 1)], nextCursor: null };

  it('patches a page, a paged list and a single post; same value when nothing changes', () => {
    const fix = (p: PostWithAuthor) => (p.id === P1 ? { ...p, like_count: 4 } : p);
    const patched = mapCachedPosts(page, fix) as typeof page;
    expect(patched).not.toBe(page);
    expect(patched.items[1]!.like_count).toBe(4);
    expect(patched.items[0]).toBe(page.items[0]);

    const paged = { pages: [page], pageParams: [null] };
    const patchedPaged = mapCachedPosts(paged, fix) as typeof paged;
    expect(patchedPaged.pageParams).toBe(paged.pageParams);
    expect(patchedPaged.pages[0]!.items[1]!.like_count).toBe(4);

    expect((mapCachedPosts(post(P1, 1), fix) as PostWithAuthor).like_count).toBe(4);
    expect(mapCachedPosts(page, (p) => p)).toBe(page);
    // Other cached shapes (where an entry is shared) are left alone.
    const shares = { circleIds: ['c1'], version: 'written', postIds: [P1], circles: [] };
    expect(mapCachedPosts(shares, () => null)).toBe(shares);
  });

  it('removes a deleted post from lists and empties a single post', () => {
    const gone = (p: PostWithAuthor) => (p.id === P1 ? null : p);
    expect((mapCachedPosts(page, gone) as typeof page).items.map((p) => p.id)).toEqual([P2]);
    expect(mapCachedPosts(post(P1, 1), gone)).toBeNull();
  });
});

describe('placing a new post', () => {
  it('reads the feed keys', () => {
    expect(feedKeyInfo(['circlePosts', 'feed', 'c1', 'preview', 10, 'all'], 'c1')).toEqual({
      kind: 'preview',
      limit: 10,
      creatorOnly: null,
    });
    expect(feedKeyInfo(['circlePosts', 'feed', 'c1', 'all', 'owner'], 'c1')).toEqual({
      kind: 'all',
      creatorOnly: 'owner',
    });
    expect(feedKeyInfo(['circlePosts', 'feed', 'c2', 'all', 'all'], 'c1')).toBeNull();
    expect(feedKeyInfo(['circlePosts', 'replies', 'c1'], 'c1')).toBeNull();
  });

  it('a preview window takes the new post on top and keeps its size', () => {
    const preview = { items: [post(P2, 2), post(P1, 1)], nextCursor: null };
    const next = insertIntoFeed(preview, post(P3, 3), { kind: 'preview', limit: 2, creatorOnly: null }) as typeof preview;
    expect(next.items.map((p) => p.id)).toEqual([P3, P2]);
  });

  it('a Public prompts list only takes the creator’s posts', () => {
    const preview = { items: [post(P1, 1)], nextCursor: null };
    const info = { kind: 'preview' as const, limit: 5, creatorOnly: 'owner' };
    expect(insertIntoFeed(preview, post(P2, 2, { author_id: 'member' }), info)).toBe(preview);
    const next = insertIntoFeed(preview, post(P2, 2, { author_id: 'owner' }), info) as typeof preview;
    expect(next.items.map((p) => p.id)).toEqual([P2, P1]);
  });

  it('a paged list puts it in order, leaves older ones for later pages, replaces a copy it has', () => {
    const paged = {
      pages: [
        { items: [post(id(9), 9), post(id(8), 8)], nextCursor: { created_at: 'x', id: id(8) } },
        { items: [post(id(7), 7), post(id(6), 6)], nextCursor: { created_at: 'y', id: id(6) } },
      ],
      pageParams: [null, { created_at: 'x', id: id(8) }],
    };
    const all = { kind: 'all' as const, creatorOnly: null };
    const top = insertIntoFeed(paged, post(id(10), 10), all) as typeof paged;
    expect(top.pages[0]!.items.map((p) => p.id)).toEqual([id(10), id(9), id(8)]);
    expect(top.pages[0]!.nextCursor).toBe(paged.pages[0]!.nextCursor);
    // A post that became visible later but was written earlier lands in its own spot.
    const written = { created_at: '2026-10-20T10:07:30.000000+00:00' };
    const middle = insertIntoFeed(paged, post(id(5), 7, written), all) as typeof paged;
    expect(middle.pages[1]!.items.map((p) => p.id)).toEqual([id(5), id(7), id(6)]);
    // Older than everything loaded while more pages exist: comes with paging.
    expect(insertIntoFeed(paged, post(id(1), 1), all)).toBe(paged);
    const replaced = insertIntoFeed(paged, post(id(8), 8, { body: 'fresh' }), all) as typeof paged;
    expect(replaced.pages[0]!.items[1]!.body).toBe('fresh');
    expect(replaced.pages[0]!.items).toHaveLength(2);
  });

  it('a fully loaded list takes an older post at its end; an empty one takes it', () => {
    const done = { pages: [{ items: [post(P2, 2)], nextCursor: null }], pageParams: [null] };
    const all = { kind: 'all' as const, creatorOnly: null };
    expect((insertIntoFeed(done, post(P1, 1), all) as typeof done).pages[0]!.items.map((p) => p.id)).toEqual([P2, P1]);
    const empty = { pages: [{ items: [] as PostWithAuthor[], nextCursor: null }], pageParams: [null] };
    expect((insertIntoFeed(empty, post(P1, 1), all) as typeof empty).pages[0]!.items).toHaveLength(1);
  });

  it('orders newest first, then by id', () => {
    expect(compareFeed(post(P2, 2), post(P1, 1))).toBeLessThan(0);
    expect(compareFeed(post(P1, 1), post(P2, 1))).toBeGreaterThan(0);
    expect(compareFeed(post(P1, 1), post(P1, 1))).toBe(0);
  });
});

describe('what belongs to a circle (for catching up)', () => {
  const none = () => undefined;
  it('its feeds, its posts, and the reply lists of its posts', () => {
    expect(queryInCircle(['circlePosts', 'feed', 'c1', 'all', 'all'], undefined, 'c1', none)).toBe(true);
    expect(queryInCircle(['circlePosts', 'feed', 'c2', 'all', 'all'], undefined, 'c1', none)).toBe(false);
    expect(queryInCircle(['circlePosts', 'post', P1], post(P1, 1), 'c1', none)).toBe(true);
    expect(queryInCircle(['circlePosts', 'post', P1], post(P1, 1, { circle_id: 'c2' }), 'c1', none)).toBe(false);
    const replies = { pages: [{ items: [post(R1, 3, { parent_id: P1 })], nextCursor: null }] };
    expect(queryInCircle(['circlePosts', 'replies', P1], replies, 'c1', none)).toBe(true);
    // No replies loaded yet: decided by the post they belong to.
    const empty = { pages: [{ items: [], nextCursor: null }] };
    expect(queryInCircle(['circlePosts', 'replies', P1], empty, 'c1', () => 'c1')).toBe(true);
    expect(queryInCircle(['circlePosts', 'replies', P1], empty, 'c1', none)).toBe(false);
    expect(queryInCircle(['circlePosts', 'entryShares', 'e1'], undefined, 'c1', none)).toBe(false);
    expect(queryInCircle(['circleStanding'], undefined, 'c1', none)).toBe(false);
  });
});

describe('holding new posts while scrolled down', () => {
  it('knows when the person has scrolled away from the top', () => {
    expect(isAwayFromTop(0)).toBe(false);
    expect(isAwayFromTop(AWAY_FROM_TOP)).toBe(false);
    expect(isAwayFromTop(AWAY_FROM_TOP + 1)).toBe(true);
  });

  it('nothing held: shows the list as loaded', () => {
    const fresh = [post(P2, 2), post(P1, 1)];
    expect(heldFeedView(fresh, null)).toEqual({ shown: fresh, held: 0 });
  });

  it('keeps what was showing, counts new posts, shows edits and drops deletions', () => {
    const snapshot = [post(id(5), 5), post(id(4), 4), post(id(3), 3)];
    // Two new posts came in (7 and 6), 4 was deleted, 5 got a heart.
    const fresh = [post(id(7), 7), post(id(6), 6), post(id(5), 5, { like_count: 1 }), post(id(3), 3)];
    const { shown, held } = heldFeedView(fresh, snapshot);
    expect(held).toBe(2);
    expect(shown.map((p) => p.id)).toEqual([id(5), id(3)]);
    expect(shown[0]!.like_count).toBe(1);
  });

  it('a post that only slid off the end of a fixed-size window stays (the one being read)', () => {
    const snapshot = [post(id(5), 5), post(id(4), 4), post(id(3), 3)];
    const fresh = [post(id(6), 6), post(id(5), 5), post(id(4), 4)];
    const { shown, held } = heldFeedView(fresh, snapshot);
    expect(held).toBe(1);
    expect(shown.map((p) => p.id)).toEqual([id(5), id(4), id(3)]);
  });

  it('older posts loaded since (the next page) join the end', () => {
    const snapshot = [post(id(5), 5), post(id(4), 4)];
    const fresh = [post(id(5), 5), post(id(4), 4), post(id(3), 3), post(id(2), 2)];
    expect(heldFeedView(fresh, snapshot)).toEqual({ shown: fresh, held: 0 });
  });

  it('a deleted post at the very end goes too (known deletions)', () => {
    const snapshot = [post(id(5), 5), post(id(4), 4)];
    const fresh = [post(id(6), 6), post(id(5), 5)];
    expect(heldFeedView(fresh, snapshot, (x) => x === id(4)).shown.map((p) => p.id)).toEqual([id(5)]);
    // Not known to be deleted: it only slid off the end, so it stays.
    expect(heldFeedView(fresh, snapshot).shown.map((p) => p.id)).toEqual([id(5), id(4)]);
  });

  it('when everything is deleted, nothing is shown', () => {
    expect(heldFeedView([], [post(P1, 1)])).toEqual({ shown: [], held: 0 });
  });
});
