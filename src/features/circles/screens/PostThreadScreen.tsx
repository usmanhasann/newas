import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { LoadingScreen, Screen, Text } from '@components';
import { colors, type MoodKey } from '@theme';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { fetchMyCircleStanding } from '@features/moderation';
import { useCrisisScan } from '@features/crisis';
import type { CirclesStackParamList } from '@/navigation/types';
import { ArchivedCircleLabel } from '../components/ArchivedCircleLabel';
import { Composer } from '../components/Composer';
import { LoadError } from '../components/LoadError';
import { PostCard } from '../components/PostCard';
import { StandingNotice } from '../components/StandingNotice';
import { MoreReplies, ThreadGroup, type PostActions } from '../components/ThreadGroup';
import { circlePostPermissions, standingNotice } from '../postingLogic';
import { useCircle, useMyCircles } from '../hooks';
import {
  replyItems,
  usePost,
  useReplies,
  useCreatePost,
  useRetryReflection,
  useToggleHeart,
} from '../postsHooks';
import { usePostMenu } from '../postMenu';
import { useCircleLive } from '../circleLive';
import { PostBlockedError, type PostWithAuthor } from '../postsApi';

type Props = NativeStackScreenProps<CirclesStackParamList, 'PostThread'>;

/**
 * A post's page, where people react and reply. Replying goes to the post itself, or to someone's
 * reply (tap "Reply" on it, or arrive from a feed's Reply on a reply, already aimed at it). Each
 * reply shows with its own replies collapsed under "View N replies", in Public and Private circles
 * alike (client 10/14 p.6); a reply to one of those joins that group tagged "@" the person, never
 * a deeper level.
 * Live (client 10/14 p.7): replies from other members, hearts, reply counts, edits and deletions
 * show up on their own while the page is open, so two people can talk without leaving and coming
 * back. New replies join the end, below what's being read.
 */
export function PostThreadScreen({ navigation, route }: Props) {
  const { circleId, postId, replyToId } = route.params;
  const user = useCurrentUser();
  const rootQ = usePost(postId);
  const repliesQ = useReplies(postId);
  const replies = replyItems(repliesQ);
  // Arriving aimed at a reply deeper in the thread (a feed's Reply on a reply to a reply): it isn't
  // among the post's own replies, so load it.
  const presetQ = usePost(replyToId && !replies.some((r) => r.id === replyToId) ? replyToId : '');
  const circleQ = useCircle(circleId);
  const { data: myCircles = [] } = useMyCircles();
  useCircleLive(circleId, myCircles.some((c) => c.id === circleId));
  const { data: standing = 'ok' } = useQuery({
    queryKey: ['circleStanding'],
    queryFn: fetchMyCircleStanding,
    enabled: !!user?.id,
  });
  const create = useCreatePost(circleId);
  const heart = useToggleHeart();
  const retryReflection = useRetryReflection();
  const circle = circleQ.data;
  const openMenu = usePostMenu(
    { owner_id: circle?.owner_id ?? null },
    { onDeleted: (p) => p.id === postId && navigation.goBack() },
  );
  // System 2 (crisis), app-wide and separate from Circle moderation: scans post/reply text and
  // offers the crisis resources sheet. Never flags or penalizes, and never blocks the post.
  const { scan: scanCrisis, sheet: crisisSheet } = useCrisisScan();
  const [target, setTarget] = useState<PostWithAuthor | null>(null);
  // Arriving from a feed's Reply on a reply: aim at that reply until the person picks otherwise.
  const [presetDone, setPresetDone] = useState(false);

  const back = (
    <View className="flex-row items-center gap-3 px-5 py-3">
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      {/* A shared entry is a post like any other (spec: not singled out); its ✨ marks a reflection. */}
      <Text variant="h3">Post</Text>
    </View>
  );

  if (rootQ.isLoading || circleQ.isLoading) return <LoadingScreen />;
  const root = rootQ.data;
  if ((rootQ.isError && !root) || (circleQ.isError && !circle)) {
    return (
      <Screen padded={false}>
        {back}
        <LoadError
          className="mx-5 mt-4"
          title="We couldn’t load this post"
          retrying={rootQ.isFetching || circleQ.isFetching}
          onRetry={() => {
            void rootQ.refetch();
            void circleQ.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!root || !circle) {
    // Also where a post lands when it's deleted while open (live): keep the way back.
    return (
      <Screen padded={false}>
        {back}
        <Text variant="bodyMuted" className="mt-10 text-center">
          This post isn’t available.
        </Text>
      </Screen>
    );
  }

  const perms = circlePostPermissions({
    circleType: circle.type,
    isOwner: circle.owner_id === user?.id,
    isMember: myCircles.some((c) => c.id === circleId),
    isBanned: false, // a banned user is not a member, so they never reach this screen
    archived: !!circle.archived_at,
    standing,
  });
  // A post's replies each head their own collapsible group (Public and Private alike); a page
  // opened on a reply itself lists that reply's replies.
  const grouped = root.parent_id === null;
  const deepPreset = presetQ.data?.circle_id === circleId ? presetQ.data : null;
  const preset =
    !presetDone && replyToId
      ? (replies.find((r) => r.id === replyToId) ?? deepPreset ?? null)
      : null;
  // Until a deeper reply being answered has loaded, don't send (it would go to the post instead).
  const presetLoading = !presetDone && !!replyToId && !preset && presetQ.isLoading;
  const current = target ?? preset;
  const replyTarget = current ?? root;
  const aimAt = (p: PostWithAuthor | null) => {
    setPresetDone(true);
    setTarget(p);
  };

  const actions: PostActions = {
    perms,
    onHeart: (p) => heart.mutate({ postId: p.id, on: !p.liked_by_me }),
    onReply: (p) => aimAt(p.id === root.id ? null : p),
    onMenu: openMenu,
    onRetryReflection: (p) => {
      if (p.entry_id && !retryReflection.isPending) retryReflection.mutate(p.entry_id);
    },
  };

  const send = async (body: string, moods: MoodKey[]) => {
    if (!perms.canReply) return false;
    void scanCrisis(body);
    try {
      await create.mutateAsync({ parentId: replyTarget.id, body, moodSlugs: moods });
      aimAt(null);
      return true;
    } catch (e) {
      toast.error(e instanceof PostBlockedError ? e.message : 'Couldn’t reply. Please try again.');
      return false;
    }
  };

  return (
    <Screen keyboardAvoiding padded={false}>
      {back}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <PostCard
          post={root}
          canReply={perms.canReply}
          canReact={perms.canReact}
          onHeart={() => actions.onHeart(root)}
          onReply={() => aimAt(null)}
          onMenu={() => openMenu(root)}
          onRetryReflection={() => actions.onRetryReflection?.(root)}
        />
        {repliesQ.isLoading && root.reply_count > 0 ? (
          <ActivityIndicator style={{ marginVertical: 8 }} color={colors.brand[500]} />
        ) : repliesQ.isError && replies.length === 0 && root.reply_count > 0 ? (
          <LoadError
            title="We couldn’t load the replies"
            retrying={repliesQ.isFetching}
            onRetry={() => void repliesQ.refetch()}
          />
        ) : (
          <>
            {replies.map((reply) =>
              grouped ? (
                <View key={reply.id} style={{ marginLeft: 24 }}>
                  <ThreadGroup post={reply} actions={actions} />
                </View>
              ) : (
                <PostCard
                  key={reply.id}
                  post={reply}
                  depth={1}
                  canReply={perms.canReply}
                  canReact={perms.canReact}
                  onHeart={() => actions.onHeart(reply)}
                  onReply={() => actions.onReply(reply)}
                  onMenu={() => openMenu(reply)}
                />
              ),
            )}
            <MoreReplies q={repliesQ} indent={24} />
          </>
        )}
      </ScrollView>

      {perms.canReply && root.body !== null ? (
        <View className="border-t border-line px-4 py-3">
          <Composer
            placeholder="Write a reply…"
            sendLabel="Send"
            busy={create.isPending || presetLoading}
            replyingTo={current ? `@${current.author?.display_name ?? 'Someone'}` : null}
            onCancelReply={() => aimAt(null)}
            onSend={send}
          />
        </View>
      ) : standingNotice(standing) ? (
        <StandingNotice standing={standing} className="mx-4 mb-3" />
      ) : circle.archived_at ? (
        // No one can reply in an archived circle (client 10/14 p.23): the reply box gives way to the
        // same label the top of the circle shows.
        <View className="border-t border-line px-4 py-3">
          <ArchivedCircleLabel className="self-start" />
        </View>
      ) : null}
      {crisisSheet}
    </Screen>
  );
}
