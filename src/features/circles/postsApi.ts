import { supabase } from '@lib';
import { chunk } from '@utils/chunk';
import { moderateCircleText, scanCirclePost } from '@features/moderation';
import type { CirclePost, EntryShareVersion } from '@app-types/database';

/** Thrown by createPost when the pre-post moderation gate blocks severe content. The composer catches
 *  this to tell the user, and the post is never persisted. Its message is user-facing. */
export class PostBlockedError extends Error {
  constructor() {
    super('This can’t be shared. It may violate our community guidelines.');
    this.name = 'PostBlockedError';
  }
}

export interface PostAuthor {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  /** The admin-only verified badge (N7), read live with each load. Absent = not verified. */
  verified?: boolean;
}

/**
 * A post/reply decorated with its author, the "@" person it answers (a reply inside a group), and
 * whether the viewer has hearted it. Shared journal entries are posts too (`entry_id` set).
 */
export interface PostWithAuthor extends CirclePost {
  author: PostAuthor | null;
  mention: PostAuthor | null;
  liked_by_me: boolean;
}

/**
 * Keyset cursor for a list of posts: the last row's time AND id, so rows sharing a timestamp at a
 * page boundary are never skipped or repeated.
 */
export interface FeedCursor {
  created_at: string;
  id: string;
}

export const FEED_PAGE = 20;
/** Replies load a page at a time ("Show more replies"), so a huge thread never loads all at once. */
export const REPLY_PAGE = 50;

/**
 * Attach author + "@" profiles and the viewer's heart state to a batch of posts. A failed lookup
 * fails the load (shown with "Try again") rather than showing everyone as "Someone" with no hearts.
 */
async function decorate(posts: CirclePost[], viewerId: string): Promise<PostWithAuthor[]> {
  if (!posts.length) return [];
  const people = [
    ...new Set(posts.flatMap((p) => [p.author_id, p.mention_user_id]).filter(Boolean)),
  ] as string[];
  const postIds = posts.map((p) => p.id);

  const [profileChunks, likeChunks] = await Promise.all([
    Promise.all(
      chunk(people).map(async (ids) => {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, verified')
          .in('user_id', ids);
        if (error) throw error;
        // `verified` (migration 20261022060000) isn't in the shared generated types yet.
        return (data ?? []) as unknown as PostAuthor[];
      }),
    ),
    Promise.all(
      chunk(postIds).map(async (ids) => {
        const { data, error } = await supabase
          .from('post_reactions')
          .select('post_id')
          .eq('user_id', viewerId)
          .in('post_id', ids);
        if (error) throw error;
        return data ?? [];
      }),
    ),
  ]);

  const byId = new Map<string, PostAuthor>(profileChunks.flat().map((p) => [p.user_id, p]));
  const liked = new Set(likeChunks.flat().map((r) => r.post_id));
  return posts.map((p) => ({
    ...p,
    author: p.author_id ? byId.get(p.author_id) ?? null : null,
    mention: p.mention_user_id ? byId.get(p.mention_user_id) ?? null : null,
    liked_by_me: liked.has(p.id),
  }));
}

/** A single post (a thread's top). */
export async function fetchPost(id: string, viewerId: string): Promise<PostWithAuthor | null> {
  const { data, error } = await supabase.from('circle_posts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await decorate([data], viewerId))[0] ?? null;
}

/**
 * One page of a circle's feed: its top-level posts, newest first. Private circles: everyone's posts
 * and shared entries together. Public circles pass `creatorOnly` (the owner) so it's the creator's
 * prompts. What a member may see (a Private circle shows only what came after they joined) is
 * enforced by RLS.
 */
export async function fetchFeedPage(
  circleId: string,
  viewerId: string,
  opts: { creatorOnly?: string | null; limit?: number; cursor?: FeedCursor | null } = {},
): Promise<{ items: PostWithAuthor[]; nextCursor: FeedCursor | null }> {
  const limit = opts.limit ?? FEED_PAGE;
  let q = supabase.from('circle_posts').select('*').eq('circle_id', circleId).is('parent_id', null);
  if (opts.creatorOnly) q = q.eq('author_id', opts.creatorOnly);
  if (opts.cursor) {
    const { created_at: at, id } = opts.cursor;
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const last = rows[rows.length - 1];
  return {
    items: await decorate(rows, viewerId),
    nextCursor: rows.length === limit && last ? { created_at: last.created_at, id: last.id } : null,
  };
}

/** Direct replies to a post, oldest first (reading order within a group), a page at a time. */
export async function fetchReplies(
  parentId: string,
  viewerId: string,
  cursor?: FeedCursor | null,
): Promise<{ items: PostWithAuthor[]; nextCursor: FeedCursor | null }> {
  let q = supabase.from('circle_posts').select('*').eq('parent_id', parentId);
  if (cursor) {
    q = q.or(
      `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
    );
  }
  const { data, error } = await q
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(REPLY_PAGE);
  if (error) throw error;
  const rows = data ?? [];
  const last = rows[rows.length - 1];
  return {
    items: await decorate(rows, viewerId),
    nextCursor: rows.length === REPLY_PAGE && last ? { created_at: last.created_at, id: last.id } : null,
  };
}

/**
 * Create a top-level post (parentId null) or a reply, optionally tagged with moods. RLS decides who
 * may post (Public: owner-only top-level; Private: any member) and applies the moderation standing;
 * the server keeps threads two levels deep (a reply to a reply joins that group with an "@").
 *  - PRE-post gate (moderateCircleText) blocks severe content before it's saved: throws
 *    PostBlockedError. Fails OPEN, so an outage never blocks posting.
 *  - POST-scan (scanCirclePost), fire-and-forget: removes the post if a violation is confirmed.
 */
export async function createPost(input: {
  circleId: string;
  parentId?: string | null;
  body: string;
  authorId: string;
  moodSlugs?: string[];
}): Promise<CirclePost> {
  const body = input.body.trim();
  const targetType = input.parentId ? 'circle_comment' : 'circle_post';
  if ((await moderateCircleText({ targetType, text: body })) === 'block') {
    throw new PostBlockedError();
  }
  const { data, error } = await supabase
    .from('circle_posts')
    .insert({
      circle_id: input.circleId,
      parent_id: input.parentId ?? null,
      body,
      author_id: input.authorId,
      mood_slugs: input.moodSlugs ?? [],
    })
    .select('*')
    .single();
  if (error) throw error;
  void scanCirclePost({ targetType, targetId: data.id, text: body });
  return data;
}

/**
 * Delete a post and every reply under it. Your own anywhere; as a circle's owner, anything in it
 * (RLS decides).
 */
export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('circle_posts').delete().eq('id', id);
  if (error) throw error;
}

/** How many replies (all levels) would go with this post: for the delete confirmation. */
export async function fetchReplyTotal(postId: string): Promise<number> {
  const { data, error } = await supabase.rpc('circle_post_reply_total', { p_post: postId });
  if (error) throw error;
  return data ?? 0;
}

/** Toggle the viewer's heart on a post (or a shared entry). */
export async function setHeart(postId: string, userId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('post_reactions')
      .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

// ---------- sharing a journal entry (Private circles only) ----------

/** One circle an entry is shared in: its post there and how many replies it has. */
export interface EntryShare {
  postId: string;
  circleId: string;
  circleName: string;
  replyTotal: number;
}

/** Where an entry is shared now, and as which version (entry page and edit screen). */
export interface EntryShares {
  circleIds: string[];
  version: EntryShareVersion | null;
  postIds: string[];
  circles: EntryShare[];
}

/**
 * Every circle the entry is shared in, INCLUDING ones its author has since left or that were
 * archived (members there still see it), so the entry never reads "Private" while it isn't, and it
 * can always be taken out. Author-only (get_entry_shares).
 */
export async function fetchEntryShares(entryId: string): Promise<EntryShares> {
  const { data, error } = await supabase.rpc('get_entry_shares', { p_entry: entryId });
  if (error) throw error;
  const rows = data ?? [];
  return {
    circleIds: rows.map((r) => r.circle_id),
    version: rows[0]?.entry_version ?? null,
    postIds: rows.map((r) => r.post_id),
    circles: rows.map((r) => ({
      postId: r.post_id,
      circleId: r.circle_id,
      circleName: r.circle_name,
      replyTotal: r.reply_total,
    })),
  };
}

/**
 * Whether text shown "As written" in a circle would be blocked, the same check as a new post.
 * Used before an edit changes the text of an entry that's already shared as written, since the
 * circle sees the new text the moment it's saved. Fails open, like posting.
 */
export async function isShareTextBlocked(text: string): Promise<boolean> {
  return (await moderateCircleText({ targetType: 'circle_post', text })) === 'block';
}

/**
 * Share an entry into exactly these Private circles (an empty list un-shares it everywhere),
 * showing `version`: the entry as written, or its AI reflection. The server copies only that
 * version into the circle, with the entry's moods. Sharing the text as written goes through the
 * same moderation as a post (the reflection is our own AI text). Returns the NEW posts, so the
 * caller can announce them.
 */
export async function shareEntry(input: {
  entryId: string;
  circleIds: string[];
  version: EntryShareVersion;
  /** The entry's text, for moderation of a "written" share. */
  note: string;
}): Promise<{ circle_id: string; post_id: string }[]> {
  const written = input.version === 'written' && input.circleIds.length > 0;
  if (written && (await moderateCircleText({ targetType: 'circle_post', text: input.note })) === 'block') {
    throw new PostBlockedError();
  }
  const { data, error } = await supabase.rpc('share_entry', {
    p_entry: input.entryId,
    p_circles: input.circleIds,
    p_version: input.version,
  });
  if (error) throw error;
  const created = data ?? [];
  if (input.version === 'written') {
    // Scan every post showing this text (new ones, and ones whose text an edit just changed).
    const { postIds } = await fetchEntryShares(input.entryId);
    for (const postId of postIds) {
      void scanCirclePost({ targetType: 'circle_post', targetId: postId, text: input.note });
    }
  }
  return created;
}
