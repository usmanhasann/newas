/**
 * Live circles (client revisions 10/14 p.7): the pure parts. How a burst of signals from a circle
 * becomes one set of cache changes, how a cached post list is patched in place (never reloaded
 * whole for one change), and how a list holds new posts back while someone is reading further down.
 */
import type { LivePostSignal } from './liveApi';
import type { PostWithAuthor } from './postsApi';

/**
 * Scrolled further down than this (px) means reading older posts: new posts wait behind the
 * "New posts" button instead of pushing what's being read down the screen. About one post card.
 */
export const AWAY_FROM_TOP = 160;

export const isAwayFromTop = (offsetY: number) => offsetY > AWAY_FROM_TOP;

type Ordered = Pick<PostWithAuthor, 'id' | 'created_at'>;

/** Feed order, newest first (created_at, then id, as the keyset pages are). Negative: `a` first. */
export function compareFeed(a: Ordered, b: Ordered): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb && !Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** What one burst of signals asks for, with repeats about the same post merged (latest wins). */
export interface LivePlan {
  /** Posts and replies to take out, with the post each one was under (null: a top-level post). */
  removed: Map<string, string | null>;
  /** New heart and reply counts to patch in place. */
  counts: Map<string, { like_count: number; reply_count: number }>;
  /** New top-level posts (and prompts) to load and place in the feed. */
  newPosts: string[];
  /** Posts or replies that have new replies: their reply lists reload. */
  newReplyParents: string[];
  /** Posts whose text or moods changed: reloaded one by one. */
  edited: string[];
}

export function planLiveBatch(signals: readonly LivePostSignal[]): LivePlan {
  const removed = new Map<string, string | null>();
  const counts = new Map<string, { like_count: number; reply_count: number }>();
  const newPosts = new Set<string>();
  const parents = new Set<string>();
  const edited = new Set<string>();
  for (const s of signals) {
    const id = s.post_id;
    if (s.op === 'delete') {
      removed.set(id, s.parent_id);
      counts.delete(id);
      newPosts.delete(id);
      edited.delete(id);
      continue;
    }
    removed.delete(id);
    counts.set(id, { like_count: s.like_count, reply_count: s.reply_count });
    if (s.op === 'insert') {
      if (s.parent_id === null) newPosts.add(id);
      else parents.add(s.parent_id);
    } else if (s.edited) {
      edited.add(id);
    }
  }
  // A new post is loaded whole anyway, and a deleted one takes its replies with it.
  for (const id of newPosts) edited.delete(id);
  for (const id of removed.keys()) parents.delete(id);
  return {
    removed,
    counts,
    newPosts: [...newPosts],
    newReplyParents: [...parents],
    edited: [...edited],
  };
}

function isPost(x: unknown): x is PostWithAuthor {
  return !!x && typeof x === 'object' && 'id' in x && 'circle_id' in x;
}

/**
 * Apply `fix` to every post inside one cached value: a single post, a page ({ items }), or a paged
 * list ({ pages }). `fix` returns the post (changed or not) or null to take it out. Returns the very
 * same value when nothing changed, so untouched lists don't re-render.
 */
export function mapCachedPosts(
  data: unknown,
  fix: (p: PostWithAuthor) => PostWithAuthor | null,
): unknown {
  if (!data || typeof data !== 'object') return data;
  if ('pages' in data && Array.isArray(data.pages)) {
    let changed = false;
    const pages = data.pages.map((page: unknown) => {
      const next = mapCachedPosts(page, fix);
      if (next !== page) changed = true;
      return next;
    });
    return changed ? { ...data, pages } : data;
  }
  if ('items' in data && Array.isArray(data.items)) {
    let changed = false;
    const items: unknown[] = [];
    for (const item of data.items as unknown[]) {
      if (!isPost(item)) {
        items.push(item);
        continue;
      }
      const next = fix(item);
      if (next !== item) changed = true;
      if (next) items.push(next);
    }
    return changed ? { ...data, items } : data;
  }
  if (isPost(data)) return fix(data);
  return data;
}

/** Which of a circle's cached feeds a query key is (keys from postsHooks: useFeedPreview, useCircleFeed). */
export type FeedKeyInfo =
  | { kind: 'preview'; limit: number; creatorOnly: string | null }
  | { kind: 'all'; creatorOnly: string | null };

export function feedKeyInfo(
  key: readonly unknown[],
  circleId: string,
): FeedKeyInfo | null {
  if (key[0] !== 'circlePosts' || key[1] !== 'feed' || key[2] !== circleId) return null;
  const creator = (v: unknown) => (typeof v === 'string' && v !== 'all' ? v : null);
  if (key[3] === 'preview' && typeof key[4] === 'number') {
    return { kind: 'preview', limit: key[4], creatorOnly: creator(key[5]) };
  }
  if (key[3] === 'all') return { kind: 'all', creatorOnly: creator(key[4]) };
  return null;
}

function placeInOrder(items: PostWithAuthor[], post: PostWithAuthor): PostWithAuthor[] {
  const rest = items.filter((p) => p.id !== post.id);
  const at = rest.findIndex((p) => compareFeed(post, p) < 0);
  return at === -1 ? [...rest, post] : [...rest.slice(0, at), post, ...rest.slice(at)];
}

/**
 * Put a newly visible top-level post into one cached feed, in order: a preview window keeps its
 * size (the oldest drops off); a paged list takes it into the page it belongs in, or leaves it for
 * a later page when it's older than everything loaded so far. A Public circle's prompts list only
 * takes the creator's posts. Already there: replaced with the fresh copy.
 */
export function insertIntoFeed(
  data: unknown,
  post: PostWithAuthor,
  info: FeedKeyInfo,
): unknown {
  if (info.creatorOnly && post.author_id !== info.creatorOnly) return data;
  if (!data || typeof data !== 'object') return data;
  if (info.kind === 'preview') {
    if (!('items' in data) || !Array.isArray(data.items)) return data;
    return {
      ...data,
      items: placeInOrder(data.items as PostWithAuthor[], post).slice(0, info.limit),
    };
  }
  if (!('pages' in data) || !Array.isArray(data.pages)) return data;
  const pages = data.pages as { items: PostWithAuthor[]; nextCursor: unknown }[];
  if (pages.some((page) => page.items.some((p) => p.id === post.id))) {
    return mapCachedPosts(data, (p) => (p.id === post.id ? post : p));
  }
  let at = pages.findIndex((page) => {
    const last = page.items[page.items.length - 1];
    return !!last && compareFeed(post, last) < 0;
  });
  if (at === -1) {
    at = pages.length - 1;
    // Older than everything loaded while there's more to load: it comes with the next page.
    if (at < 0 || pages[at]!.nextCursor !== null) return data;
  }
  return {
    ...data,
    pages: pages.map((page, i) =>
      i === at ? { ...page, items: placeInOrder(page.items, post) } : page,
    ),
  };
}

/**
 * Whether a cached post query belongs to this circle (for loading anything new on open and on
 * coming back to the app): its feeds, its posts, and the reply lists of its posts.
 */
export function queryInCircle(
  key: readonly unknown[],
  data: unknown,
  circleId: string,
  circleOfPost: (postId: string) => string | undefined,
): boolean {
  if (key[0] !== 'circlePosts') return false;
  if (key[1] === 'feed') return key[2] === circleId;
  if (key[1] === 'post') return isPost(data) && data.circle_id === circleId;
  if (key[1] === 'replies' && typeof key[2] === 'string') {
    return (firstPost(data)?.circle_id ?? circleOfPost(key[2])) === circleId;
  }
  return false;
}

function firstPost(data: unknown): PostWithAuthor | undefined {
  const found: PostWithAuthor[] = [];
  mapCachedPosts(data, (p) => {
    found.push(p);
    return p;
  });
  return found[0];
}

/**
 * The list to show while new posts are held back. `snapshot` is what was showing when the person
 * scrolled down (null: nothing held, show `fresh`). Posts in it show their latest version, removed
 * ones go (`isRemoved`: known deletions), and ones that only slid off the end of a fixed-size
 * window stay. Older posts loaded since (more pages) join the end. Newer posts wait: `held` counts
 * them for the "New posts" button.
 */
export function heldFeedView<T extends Ordered>(
  fresh: readonly T[],
  snapshot: readonly T[] | null,
  isRemoved: (id: string) => boolean = () => false,
): { shown: T[]; held: number } {
  if (!snapshot) return { shown: [...fresh], held: 0 };
  const freshById = new Map(fresh.map((p) => [p.id, p]));
  const inSnapshot = new Set(snapshot.map((p) => p.id));
  const oldestFresh = fresh[fresh.length - 1];
  const oldestSnapshot = snapshot[snapshot.length - 1];
  const shown: T[] = [];
  for (const p of snapshot) {
    const latest = freshById.get(p.id);
    if (latest) shown.push(latest);
    else if (!isRemoved(p.id) && oldestFresh && compareFeed(p, oldestFresh) > 0) shown.push(p);
  }
  let held = 0;
  for (const p of fresh) {
    if (inSnapshot.has(p.id)) continue;
    if (oldestSnapshot && compareFeed(p, oldestSnapshot) > 0) shown.push(p);
    else held += 1;
  }
  return { shown, held };
}
