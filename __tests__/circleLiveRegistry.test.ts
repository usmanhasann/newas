/**
 * Live circles (client revisions 10/14 p.7, N1): one channel per open circle, shared by its
 * screens and closed a moment after the last one leaves or when the app goes to the background.
 * A burst of signals is applied once: hearts, reply counts and deletions are patched in place, a
 * new post is loaded by itself and placed on top, a thread with new replies reloads only its
 * replies, an edit reloads only that post. Opening a circle and coming back to the app load
 * anything new right away. The channel itself (Supabase) is mocked; the cache is a real QueryClient.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { queryClient } from '@lib';
import {
  acquireCircleLive,
  wasRemovedLive,
  LIVE_FLUSH_MS,
  LIVE_LINGER_MS,
  LIVE_MAX_FETCH,
} from '@features/circles/circleLive';
import type { LivePostSignal, LiveStatus } from '@features/circles/liveApi';
import type { PostWithAuthor } from '@features/circles/postsApi';

type Handlers = { onSignal: (s: LivePostSignal) => void; onStatus: (s: LiveStatus) => void };
const mockChannels: { circleId: string; handlers: Handlers; stop: jest.Mock }[] = [];
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: (circleId: string, handlers: Handlers) => {
    const stop = jest.fn(() => Promise.resolve());
    mockChannels.push({ circleId, handlers, stop });
    return stop;
  },
}));
const mockFetchPost = jest.fn();
jest.mock('@features/circles/postsApi', () => ({
  fetchPost: (...a: unknown[]) => mockFetchPost(...a),
}));
jest.mock('@lib', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const post = (pid: string, minute: number, over: Partial<PostWithAuthor> = {}): PostWithAuthor => ({
  id: pid,
  circle_id: 'c1',
  author_id: 'u2',
  parent_id: null,
  body: `post ${minute}`,
  reply_count: 0,
  like_count: 0,
  created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00+00:00`,
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  thread_created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00+00:00`,
  author: null,
  mention: null,
  liked_by_me: false,
  ...over,
});
const signal = (over: Partial<LivePostSignal>): LivePostSignal => ({
  op: 'update',
  post_id: id(1),
  parent_id: null,
  like_count: 0,
  reply_count: 0,
  edited: false,
  ...over,
});

const P1 = id(1);
const P2 = id(2);
const R1 = id(11);
const keys = {
  preview: ['circlePosts', 'feed', 'c1', 'preview', 10, 'all'],
  all: ['circlePosts', 'feed', 'c1', 'all', 'all'],
  prompts: ['circlePosts', 'feed', 'c1', 'all', 'owner'],
  post1: ['circlePosts', 'post', P1],
  replies1: ['circlePosts', 'replies', P1],
  replies2: ['circlePosts', 'replies', P2],
  otherFeed: ['circlePosts', 'feed', 'c2', 'preview', 10, 'all'],
};
type Page = { items: PostWithAuthor[]; nextCursor: unknown };
const items = (key: unknown[]) =>
  (queryClient.getQueryData<Page>(key)?.items ?? []).map((p) => p.id);
const pageItems = (key: unknown[]) =>
  (queryClient.getQueryData<{ pages: Page[] }>(key)?.pages ?? []).flatMap((p) => p.items);
const invalidated = (key: unknown[]) => !!queryClient.getQueryState(key)?.isInvalidated;

function seed() {
  queryClient.clear();
  queryClient.setQueryData(keys.preview, { items: [post(P2, 2), post(P1, 1)], nextCursor: null });
  queryClient.setQueryData(keys.all, {
    pages: [{ items: [post(P2, 2), post(P1, 1)], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData(keys.prompts, { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  queryClient.setQueryData(keys.post1, post(P1, 1, { reply_count: 1 }));
  queryClient.setQueryData(keys.replies1, {
    pages: [{ items: [post(R1, 3, { parent_id: P1 })], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData(keys.replies2, { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  queryClient.setQueryData(keys.otherFeed, { items: [post(id(50), 1, { circle_id: 'c2' })], nextCursor: null });
}

let appListener: ((s: AppStateStatus) => void) | null = null;
beforeAll(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    appListener = fn as (s: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockChannels.length = 0;
  mockFetchPost.mockReset();
});

/** Let promise callbacks run (and timers up to `ms`). */
const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);

it('opens one channel per circle, shared by its screens, closed a moment after the last leaves', async () => {
  const a = acquireCircleLive('c1', 'u1');
  const b = acquireCircleLive('c1', 'u1');
  const other = acquireCircleLive('c2', 'u1');
  await tick();
  expect(mockChannels.map((c) => c.circleId)).toEqual(['c1', 'c2']);

  a();
  b();
  await tick(LIVE_LINGER_MS - 1);
  expect(mockChannels[0]!.stop).not.toHaveBeenCalled();
  // Back into the circle within the moment: the same channel carries on.
  const again = acquireCircleLive('c1', 'u1');
  await tick(LIVE_LINGER_MS + 1);
  expect(mockChannels[0]!.stop).not.toHaveBeenCalled();
  expect(mockChannels).toHaveLength(2);

  again();
  other();
  await tick(LIVE_LINGER_MS + 1);
  expect(mockChannels[0]!.stop).toHaveBeenCalledTimes(1);
  expect(mockChannels[1]!.stop).toHaveBeenCalledTimes(1);
});

it('opening a circle loads anything new right away (only that circle)', async () => {
  seed();
  await tick(1);
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  expect(invalidated(keys.preview)).toBe(true);
  expect(invalidated(keys.all)).toBe(true);
  expect(invalidated(keys.post1)).toBe(true);
  expect(invalidated(keys.replies1)).toBe(true);
  expect(invalidated(keys.otherFeed)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('applies a burst once: hearts and reply counts patched in place, deletions removed', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  seed();
  const loadedAt = queryClient.getQueryState(keys.post1)!.dataUpdatedAt;
  await tick(5);
  const { onSignal } = mockChannels[0]!.handlers;
  onSignal(signal({ post_id: P1, like_count: 3, reply_count: 1 }));
  onSignal(signal({ post_id: P1, like_count: 4, reply_count: 1 }));
  onSignal(signal({ op: 'delete', post_id: R1, parent_id: P1 }));
  onSignal(signal({ post_id: P1, like_count: 4, reply_count: 0 }));
  // Nothing changes until the burst is applied.
  expect(queryClient.getQueryData<PostWithAuthor>(keys.post1)!.like_count).toBe(0);
  await tick(LIVE_FLUSH_MS);

  expect(queryClient.getQueryData<PostWithAuthor>(keys.post1)!.like_count).toBe(4);
  expect(queryClient.getQueryData<PostWithAuthor>(keys.post1)!.reply_count).toBe(0);
  expect(queryClient.getQueryData<Page>(keys.preview)!.items[1]!.like_count).toBe(4);
  expect(pageItems(keys.all)[1]!.like_count).toBe(4);
  expect(pageItems(keys.replies1)).toEqual([]);
  // Patched, not reloaded: no post fetched, the feed isn't marked for reloading, load time kept.
  expect(mockFetchPost).not.toHaveBeenCalled();
  expect(invalidated(keys.all)).toBe(false);
  expect(queryClient.getQueryState(keys.post1)!.dataUpdatedAt).toBe(loadedAt);
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('a new post is loaded by itself and placed on top; a Public prompts list only takes the creator’s', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  seed();
  const P3 = id(3);
  mockFetchPost.mockResolvedValue(post(P3, 3, { body: 'Walk at 5?' }));
  mockChannels[0]!.handlers.onSignal(signal({ op: 'insert', post_id: P3 }));
  await tick(LIVE_FLUSH_MS);

  expect(mockFetchPost).toHaveBeenCalledTimes(1);
  expect(mockFetchPost).toHaveBeenCalledWith(P3, 'u1');
  expect(items(keys.preview)).toEqual([P3, P2, P1]);
  expect(pageItems(keys.all).map((p) => p.id)).toEqual([P3, P2, P1]);
  expect(pageItems(keys.prompts)).toEqual([]);
  expect(invalidated(keys.all)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('new replies reload only that thread’s replies; an edit reloads only that post', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  seed();
  mockFetchPost.mockResolvedValue(post(P1, 1, { body: 'Walk at 6?' }));
  const { onSignal } = mockChannels[0]!.handlers;
  onSignal(signal({ op: 'insert', post_id: id(12), parent_id: P2 }));
  onSignal(signal({ post_id: P2, reply_count: 1 }));
  onSignal(signal({ post_id: P1, edited: true }));
  await tick(LIVE_FLUSH_MS);

  expect(invalidated(keys.replies2)).toBe(true);
  expect(invalidated(keys.replies1)).toBe(false);
  expect(invalidated(keys.all)).toBe(false);
  expect(items(keys.preview)).toEqual([P2, P1]);
  expect(queryClient.getQueryData<Page>(keys.preview)!.items[0]!.reply_count).toBe(1);
  expect(mockFetchPost).toHaveBeenCalledTimes(1);
  expect(mockFetchPost).toHaveBeenCalledWith(P1, 'u1');
  expect(pageItems(keys.all)[1]!.body).toBe('Walk at 6?');
  expect(queryClient.getQueryData<PostWithAuthor>(keys.post1)!.body).toBe('Walk at 6?');
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('a deleted post leaves every list (the preview refills); one this person can’t see is dropped', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  seed();
  mockFetchPost.mockResolvedValue(null);
  const { onSignal } = mockChannels[0]!.handlers;
  onSignal(signal({ op: 'delete', post_id: P1 }));
  onSignal(signal({ op: 'insert', post_id: id(9) }));
  await tick(LIVE_FLUSH_MS);

  expect(items(keys.preview)).toEqual([P2]);
  expect(invalidated(keys.preview)).toBe(true);
  expect(pageItems(keys.all).map((p) => p.id)).toEqual([P2]);
  expect(queryClient.getQueryData(keys.post1)).toBeNull();
  expect(pageItems(keys.all).map((p) => p.id)).not.toContain(id(9));
  // Remembered, so a list holding new posts back drops them too.
  expect(wasRemovedLive(P1)).toBe(true);
  expect(wasRemovedLive(id(9))).toBe(true);
  expect(wasRemovedLive(P2)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('a big burst reloads the circle’s feed once instead of fetching each post', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  seed();
  for (let n = 0; n <= LIVE_MAX_FETCH; n += 1) {
    mockChannels[0]!.handlers.onSignal(signal({ op: 'insert', post_id: id(20 + n) }));
  }
  await tick(LIVE_FLUSH_MS);
  expect(mockFetchPost).not.toHaveBeenCalled();
  expect(invalidated(keys.all)).toBe(true);
  expect(invalidated(keys.otherFeed)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
});

it('closes in the background; coming back reopens and loads anything new right away', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  expect(appListener).not.toBeNull();
  appListener!('background');
  await tick();
  expect(mockChannels[0]!.stop).toHaveBeenCalledTimes(1);
  // Signals that were waiting when it went to the background are dropped (coming back reloads).
  seed();
  await tick(5);
  appListener!('active');
  await tick();
  expect(mockChannels).toHaveLength(2);
  expect(invalidated(keys.all)).toBe(true);
  expect(invalidated(keys.otherFeed)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
  expect(mockChannels[1]!.stop).toHaveBeenCalledTimes(1);
});

it('after a dropped connection rejoins, it loads what may have been missed', async () => {
  const release = acquireCircleLive('c1', 'u1');
  await tick();
  const { onStatus } = mockChannels[0]!.handlers;
  seed();
  await tick(5);
  onStatus('live');
  // First join: data loaded after the circle was opened is current.
  expect(invalidated(keys.all)).toBe(false);
  onStatus('down');
  await tick(5);
  onStatus('live');
  expect(invalidated(keys.all)).toBe(true);
  expect(invalidated(keys.otherFeed)).toBe(false);
  release();
  await tick(LIVE_LINGER_MS + 1);
});
