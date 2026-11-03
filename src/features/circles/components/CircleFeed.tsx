import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, LoadingScreen, Text } from '@components';
import { colors, type MoodKey } from '@theme';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { fetchMyCircleStanding } from '@features/moderation';
import { useCrisisScan } from '@features/crisis';
import type { Circle } from '@app-types/database';
import { Composer } from './Composer';
import { LoadError } from './LoadError';
import { useHeldFeed, useReportHeld } from './NewPostsButton';
import { PostCard } from './PostCard';
import { StandingNotice } from './StandingNotice';
import { ThreadGroup, type PostActions } from './ThreadGroup';
import { PostBlockedError, type PostWithAuthor } from '../postsApi';
import { circlePostPermissions, feedPreviewCount, standingNotice } from '../postingLogic';
import { useCreatePost, useFeedPreview, useRetryReflection, useToggleHeart } from '../postsHooks';
import { usePostMenu } from '../postMenu';
import { useCircleLive } from '../circleLive';

const NO_POSTS: PostWithAuthor[] = [];

/**
 * A circle's one feed (Board and Posts merged). Public: the creator's prompts, the 5 newest here;
 * tap one to read and reply. Private: everyone's posts and shared entries together, the 10 newest,
 * each with its replies collapsed under "View N replies". The arrow opens the full list.
 *
 * Live (client 10/14 p.7): new posts, prompts and replies, hearts, reply counts, edits and deletions
 * show up on their own while the circle is open. While the page around it says the person is
 * scrolled down (`holdNewPosts`), new posts wait instead of pushing what they're reading down;
 * `onNewPostsWaiting` reports how many, for the page's "New posts" button.
 */
export function CircleFeed({
  circle,
  isMember,
  onOpenThread,
  onSeeAll,
  holdNewPosts = false,
  onNewPostsWaiting,
}: {
  circle: Circle;
  isMember: boolean;
  /** Open a post's page; `replyToId` opens it already answering that reply. */
  onOpenThread: (postId: string, replyToId?: string) => void;
  onSeeAll: () => void;
  /** The page is scrolled down: keep new posts out of the list until it isn't. */
  holdNewPosts?: boolean;
  onNewPostsWaiting?: (count: number) => void;
}) {
  const user = useCurrentUser();
  const isOwner = circle.owner_id === user?.id;
  const isPublic = circle.type === 'public';
  const previewQ = useFeedPreview(
    circle.id,
    feedPreviewCount(circle.type),
    isPublic ? circle.owner_id : null,
  );
  useCircleLive(circle.id, isMember);
  const create = useCreatePost(circle.id);
  const heart = useToggleHeart();
  const retryReflection = useRetryReflection();
  const openMenu = usePostMenu(circle);
  const { data: standing = 'ok' } = useQuery({
    queryKey: ['circleStanding'],
    queryFn: fetchMyCircleStanding,
    enabled: !!user?.id,
  });
  // System 2 (crisis), app-wide and separate from Circle moderation: offers the crisis resources
  // sheet; never flags or penalizes, and never blocks the post.
  const { scan: scanCrisis, sheet: crisisSheet } = useCrisisScan();

  const perms = circlePostPermissions({
    circleType: circle.type,
    isOwner,
    isMember,
    isBanned: false,
    archived: !!circle.archived_at,
    standing,
  });
  const { shown: items, held } = useHeldFeed(previewQ.data?.items ?? NO_POSTS, holdNewPosts);
  useReportHeld(held, onNewPostsWaiting);

  const post = async (body: string, moods: MoodKey[]) => {
    if (!perms.canPostTopLevel) return false;
    void scanCrisis(body);
    try {
      await create.mutateAsync({ parentId: null, body, moodSlugs: moods });
      return true;
    } catch (e) {
      toast.error(e instanceof PostBlockedError ? e.message : 'Couldn’t post. Please try again.');
      return false;
    }
  };

  const actions: PostActions = {
    perms,
    onHeart: (p) => heart.mutate({ postId: p.id, on: !p.liked_by_me }),
    // Answering a reply happens on its post's page (where the answer shows), already aimed at it.
    onReply: (p, rootId) =>
      rootId ? onOpenThread(rootId, p.id) : p.parent_id ? onOpenThread(p.parent_id, p.id) : onOpenThread(p.id),
    onMenu: openMenu,
    onRetryReflection: (p) => {
      if (p.entry_id && !retryReflection.isPending) retryReflection.mutate(p.entry_id);
    },
  };

  // Where the post box would be, when there isn't one. An archived circle (client 10/14 p.23) gets
  // no box and no "you can reply" hint: the circle's page shows "This circle has been archived."
  // right above this, in its header, so it isn't said twice.
  const noPostBoxNote = standingNotice(standing) ? (
    <StandingNotice standing={standing} className="mb-4" />
  ) : isPublic && !isOwner && !circle.archived_at ? (
    <Text variant="caption" className="mb-4">
      Only the creator starts prompts here. You can reply to any of them.
    </Text>
  ) : null;

  return (
    <View>
      {perms.canPostTopLevel ? (
        <Card className="mb-4">
          <Composer
            placeholder={isPublic ? 'Start a new prompt…' : 'Share with your circle…'}
            sendLabel={isPublic ? 'Post prompt' : 'Post'}
            busy={create.isPending}
            onSend={post}
            multilineMinHeight={70}
          />
        </Card>
      ) : (
        noPostBoxNote
      )}

      <View className="mb-3 flex-row items-center justify-between">
        <Text variant="section">{isPublic ? 'Prompts' : 'Posts'}</Text>
        {items.length > 0 ? (
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={isPublic ? 'See all prompts' : 'See all posts'}
            hitSlop={12}
            className="h-11 w-11 flex-row items-center justify-end"
          >
            <Ionicons name="arrow-forward" size={20} color={colors.brand[500]} />
          </Pressable>
        ) : null}
      </View>

      {previewQ.isLoading ? (
        <LoadingScreen />
      ) : previewQ.isError && !previewQ.data ? (
        <LoadError
          title={isPublic ? 'We couldn’t load the prompts' : 'We couldn’t load the posts'}
          retrying={previewQ.isFetching}
          onRetry={() => void previewQ.refetch()}
        />
      ) : items.length === 0 ? (
        <Card>
          <Text variant="bodyStrong">Nothing here yet</Text>
          <Text variant="bodyMuted" className="mt-1">
            {!isPublic
              ? 'Be the first to post, or share an entry from your journal.'
              : perms.canPostTopLevel
                ? 'Write your first prompt above to start the conversation.'
                : 'The creator hasn’t posted a prompt yet.'}
          </Text>
        </Card>
      ) : isPublic ? (
        items.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            canReply={perms.canReply}
            canReact={perms.canReact}
            onOpen={() => onOpenThread(p.id)}
            onHeart={() => actions.onHeart(p)}
            onReply={() => onOpenThread(p.id)}
            onMenu={() => openMenu(p)}
          />
        ))
      ) : (
        items.map((p) => (
          <ThreadGroup key={p.id} post={p} actions={actions} onOpen={(x) => onOpenThread(x.id)} />
        ))
      )}
      {crisisSheet}
    </View>
  );
}
