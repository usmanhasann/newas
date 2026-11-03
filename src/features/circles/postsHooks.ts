import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { notifyEvent } from '@features/notifications';
import { invokeAiSummary } from '@features/ai-summary';
import type { EntryShareVersion } from '@app-types/database';
import * as posts from './postsApi';
import { postKeys } from './postKeys';

export { postKeys };

/**
 * The newest few top-level items for a circle's page: `limit` of them (Public: the creator's
 * prompts, pass `creatorOnly`; Private: posts and shared entries together).
 */
export function useFeedPreview(circleId: string, limit: number, creatorOnly?: string | null) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...postKeys.feed(circleId), 'preview', limit, creatorOnly ?? 'all'],
    queryFn: () => posts.fetchFeedPage(circleId, user!.id, { creatorOnly, limit }),
    enabled: !!circleId && !!user?.id,
  });
}

/** The whole feed, a page at a time (the "see all" list). */
export function useCircleFeed(circleId: string, creatorOnly?: string | null) {
  const user = useCurrentUser();
  return useInfiniteQuery({
    queryKey: [...postKeys.feed(circleId), 'all', creatorOnly ?? 'all'],
    queryFn: ({ pageParam }) =>
      posts.fetchFeedPage(circleId, user!.id, { creatorOnly, cursor: pageParam }),
    initialPageParam: null as posts.FeedCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!circleId && !!user?.id,
  });
}

export function usePost(id: string) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: postKeys.post(id),
    queryFn: () => posts.fetchPost(id, user!.id),
    enabled: !!id && !!user?.id,
  });
}

/** A post's direct replies, oldest first, a page at a time (see replyItems). */
export function useReplies(parentId: string, enabled = true) {
  const user = useCurrentUser();
  return useInfiniteQuery({
    queryKey: postKeys.replies(parentId),
    queryFn: ({ pageParam }) => posts.fetchReplies(parentId, user!.id, pageParam),
    initialPageParam: null as posts.FeedCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && !!parentId && !!user?.id,
  });
}

/** The replies loaded so far, in order. */
export function replyItems(q: { data?: { pages: { items: posts.PostWithAuthor[] }[] } }) {
  return q.data?.pages.flatMap((p) => p.items) ?? [];
}

/**
 * The author's own reflection share whose AI reflection never arrived: ask for it again. When it's
 * ready the circle gets it (and is told) exactly as after sharing.
 */
export function useRetryReflection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => invokeAiSummary(entryId),
    onError: () => toast.error('Couldn’t make your reflection right now. Please try again later.'),
    onSettled: () => qc.invalidateQueries({ queryKey: postKeys.all }),
  });
}

export function useCreatePost(circleId: string) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentId?: string | null; body: string; moodSlugs?: string[] }) =>
      posts.createPost({
        circleId,
        parentId: input.parentId ?? null,
        body: input.body,
        authorId: user!.id,
        moodSlugs: input.moodSlugs,
      }),
    onSuccess: (post) => {
      // A reply changes its group's count; a top-level post changes the feed. Refresh this
      // circle's posts rather than surgically patching every count.
      if (post.parent_id) qc.invalidateQueries({ queryKey: postKeys.replies(post.parent_id) });
      qc.invalidateQueries({ queryKey: postKeys.all });
      // Fan out the notification (reply → the person answered; top-level → members). Recipients
      // are resolved server-side in send-push; fire-and-forget so it never blocks the composer.
      void notifyEvent({ type: 'post_created', circle_id: post.circle_id, post_id: post.id });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => posts.deletePost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: postKeys.all }),
  });
}

export function useToggleHeart() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, on }: { postId: string; on: boolean }) =>
      posts.setHeart(postId, user!.id, on),
    onSuccess: (_data, { postId, on }) => {
      qc.invalidateQueries({ queryKey: postKeys.all });
      // A heart tells the post's author; send-push only ever sends a person's FIRST heart on a
      // post, so un-hearting and hearting again never re-notifies. Fire-and-forget.
      if (on) void notifyEvent({ type: 'post_reaction', post_id: postId });
    },
  });
}

/** Where an entry is shared now (edit screen). */
export function useEntryShares(entryId: string | undefined) {
  return useQuery({
    queryKey: postKeys.entryShares(entryId ?? ''),
    queryFn: () => posts.fetchEntryShares(entryId!),
    enabled: !!entryId,
  });
}

/**
 * Share (or re-share, or un-share with no circles) an entry into Private circles. The caller
 * announces the share once members can see it (see useShareEntry's callers).
 */
export function useShareEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      entryId: string;
      circleIds: string[];
      version: EntryShareVersion;
      note: string;
    }) => posts.shareEntry(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: postKeys.all }),
  });
}
