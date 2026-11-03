import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '@components';
import { colors } from '@theme';
import type { CirclePerms } from '../postingLogic';
import type { PostWithAuthor } from '../postsApi';
import { replyItems, useReplies } from '../postsHooks';
import { PostCard } from './PostCard';

/** How far a reply group sits in from the post above it (same as PostCard's reply indent). */
const REPLY_INDENT = 24;

export interface PostActions {
  perms: CirclePerms;
  onHeart: (p: PostWithAuthor) => void;
  /** Reply to `p`; `rootId` = the post its thread belongs to, when `p` sits deeper in it. */
  onReply: (p: PostWithAuthor, rootId?: string) => void;
  onMenu: (p: PostWithAuthor) => void;
  /** The author's own reflection share whose AI reflection hasn't arrived: ask again. */
  onRetryReflection?: (p: PostWithAuthor) => void;
}

/**
 * The end of a loaded list of replies: "Show more replies" while there are more, or a way to retry
 * when a page couldn't load. Nothing once everything is showing.
 */
export function MoreReplies({
  q,
  indent = 0,
}: {
  q: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isError: boolean;
    isFetching: boolean;
    fetchNextPage: () => unknown;
    refetch: () => unknown;
  };
  indent?: number;
}) {
  if (q.isFetchingNextPage) {
    return <ActivityIndicator style={{ marginLeft: indent, marginVertical: 8 }} color={colors.brand[500]} />;
  }
  if (q.isError && !q.isFetching) {
    return (
      <Pressable
        onPress={() => void (q.hasNextPage ? q.fetchNextPage() : q.refetch())}
        accessibilityRole="button"
        hitSlop={6}
        style={{ marginLeft: indent }}
        className="mb-2"
      >
        <Text variant="caption" className="text-brand-600">
          Couldn’t load replies. Tap to try again.
        </Text>
      </Pressable>
    );
  }
  if (!q.hasNextPage) return null;
  return (
    <Pressable
      onPress={() => void q.fetchNextPage()}
      accessibilityRole="button"
      hitSlop={6}
      style={{ marginLeft: indent }}
      className="mb-2"
    >
      <Text variant="caption" className="text-brand-600">
        Show more replies
      </Text>
    </Pressable>
  );
}

/**
 * A post (or a reply) with its replies collapsed under "View N replies", Instagram style. Under a
 * post, each reply is its own group (its replies collapsed under it); under a reply, replies sit
 * one level in, and a reply to one of them joins that group tagged "@" the person it answers, so
 * threads never get deeper than post > reply > reply. Public and Private circles alike (client
 * 10/14 p.6).
 */
export function ThreadGroup({
  post,
  actions,
  onOpen,
  initiallyOpen = false,
}: {
  post: PostWithAuthor;
  actions: PostActions;
  onOpen?: (p: PostWithAuthor) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const repliesQ = useReplies(post.id, open && post.reply_count > 0);
  const replies = replyItems(repliesQ);

  return (
    <View>
      <PostCard
        post={post}
        canReply={actions.perms.canReply}
        canReact={actions.perms.canReact}
        repliesOpen={open}
        onToggleReplies={() => setOpen((o) => !o)}
        onOpen={onOpen ? () => onOpen(post) : undefined}
        onHeart={() => actions.onHeart(post)}
        onReply={() => actions.onReply(post)}
        onMenu={() => actions.onMenu(post)}
        onRetryReflection={
          actions.onRetryReflection ? () => actions.onRetryReflection!(post) : undefined
        }
      />
      {open && post.reply_count > 0 ? (
        repliesQ.isLoading ? (
          <ActivityIndicator style={{ marginLeft: 24, marginVertical: 8 }} color={colors.brand[500]} />
        ) : (
          <>
            {replies.map((reply) =>
              post.parent_id === null ? (
                // A reply to the post heads its own group; answering inside it stays in this
                // post's thread.
                <View key={reply.id} style={{ marginLeft: REPLY_INDENT }}>
                  <ThreadGroup
                    post={reply}
                    actions={{ ...actions, onReply: (p) => actions.onReply(p, post.id) }}
                  />
                </View>
              ) : (
                <PostCard
                  key={reply.id}
                  post={reply}
                  depth={1}
                  canReply={actions.perms.canReply}
                  canReact={actions.perms.canReact}
                  onHeart={() => actions.onHeart(reply)}
                  onReply={() => actions.onReply(reply)}
                  onMenu={() => actions.onMenu(reply)}
                />
              ),
            )}
            <MoreReplies q={repliesQ} indent={24} />
          </>
        )
      ) : null}
    </View>
  );
}
