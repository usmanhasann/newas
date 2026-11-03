import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingScreen, Screen, Text } from '@components';
import { colors } from '@theme';
import { useCurrentUser } from '@store/session';
import { fetchMyCircleStanding } from '@features/moderation';
import type { CirclesStackParamList } from '@/navigation/types';
import { ArchivedCircleLabel } from '../components/ArchivedCircleLabel';
import { LoadError } from '../components/LoadError';
import { NewPostsButton, useHeldFeed, useNewPostsScroll } from '../components/NewPostsButton';
import { PostCard } from '../components/PostCard';
import { ThreadGroup, type PostActions } from '../components/ThreadGroup';
import { circlePostPermissions } from '../postingLogic';
import { useCircle, useMyCircles } from '../hooks';
import { useCircleFeed, useRetryReflection, useToggleHeart } from '../postsHooks';
import { usePostMenu } from '../postMenu';
import { useCircleLive } from '../circleLive';
import type { PostWithAuthor } from '../postsApi';

type Props = NativeStackScreenProps<CirclesStackParamList, 'CircleFeed'>;

/**
 * The full list behind a circle's arrow: every prompt (Public) or every post (Private), paged.
 * Live (client 10/14 p.7): new posts and replies, hearts, counts, edits and deletions show up on
 * their own. Scrolled down reading older posts, new ones wait behind a "New posts" button at the
 * top instead of moving the list; tapping it goes up to them.
 */
export function CircleFeedScreen({ navigation, route }: Props) {
  const { circleId } = route.params;
  const user = useCurrentUser();
  const { data: circle, isLoading } = useCircle(circleId);
  const { data: myCircles = [] } = useMyCircles();
  const isPublic = circle?.type === 'public';
  const feedQ = useCircleFeed(circleId, isPublic ? circle?.owner_id : null);
  const heart = useToggleHeart();
  const retryReflection = useRetryReflection();
  const openMenu = usePostMenu({ owner_id: circle?.owner_id ?? null });
  const { data: standing = 'ok' } = useQuery({
    queryKey: ['circleStanding'],
    queryFn: fetchMyCircleStanding,
    enabled: !!user?.id,
  });
  const isMember = myCircles.some((c) => c.id === circleId);
  useCircleLive(circleId, isMember);
  const scroll = useNewPostsScroll<FlatList<PostWithAuthor>>();
  const loaded = useMemo(() => feedQ.data?.pages.flatMap((p) => p.items) ?? [], [feedQ.data]);
  const { shown: items, held } = useHeldFeed(loaded, scroll.away);

  if (isLoading || !circle) return <LoadingScreen />;

  const perms = circlePostPermissions({
    circleType: circle.type,
    isOwner: circle.owner_id === user?.id,
    isMember,
    isBanned: false,
    archived: !!circle.archived_at,
    standing,
  });
  const open = (postId: string, replyToId?: string) =>
    navigation.navigate('PostThread', { circleId, postId, replyToId });
  const actions: PostActions = {
    perms,
    onHeart: (p) => heart.mutate({ postId: p.id, on: !p.liked_by_me }),
    // Answering a reply opens its post's page aimed at it (rootId: the post, for a deeper reply).
    onReply: (p, rootId) =>
      rootId ? open(rootId, p.id) : p.parent_id ? open(p.parent_id, p.id) : open(p.id),
    onMenu: openMenu,
    onRetryReflection: (p) => {
      if (p.entry_id && !retryReflection.isPending) retryReflection.mutate(p.entry_id);
    },
  };

  return (
    <Screen padded={false}>
      <View className="px-5 py-3">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text variant="h3" numberOfLines={1} className="flex-1">
            {isPublic ? 'All prompts' : 'All posts'}
          </Text>
        </View>
        {/* The full list has no post box; an archived circle says why at the top, as its page does
            (client 10/14 p.23). */}
        {circle.archived_at ? <ArchivedCircleLabel className="mt-3 self-start" /> : null}
      </View>
      <View className="flex-1">
        <FlatList
          {...scroll.scrollProps}
          testID="circle-feed-list"
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item }) =>
            isPublic ? (
              <PostCard
                post={item}
                canReply={perms.canReply}
                canReact={perms.canReact}
                onOpen={() => open(item.id)}
                onHeart={() => actions.onHeart(item)}
                onReply={() => open(item.id)}
                onMenu={() => openMenu(item)}
              />
            ) : (
              <ThreadGroup post={item} actions={actions} onOpen={(p) => open(p.id)} />
            )
          }
          onEndReached={() => {
            if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) void feedQ.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            feedQ.isLoading ? (
              <LoadingScreen />
            ) : feedQ.isError ? (
              <LoadError
                className="mt-6"
                title={isPublic ? 'We couldn’t load the prompts' : 'We couldn’t load the posts'}
                retrying={feedQ.isFetching}
                onRetry={() => void feedQ.refetch()}
              />
            ) : (
              <Text variant="bodyMuted" className="mt-10 text-center">
                Nothing here yet.
              </Text>
            )
          }
          ListFooterComponent={
            feedQ.isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.brand[500]} />
            ) : feedQ.isFetchNextPageError ? (
              <LoadError
                className="mt-2"
                title="We couldn’t load more"
                retrying={feedQ.isFetchingNextPage}
                onRetry={() => void feedQ.fetchNextPage()}
              />
            ) : null
          }
        />
        <NewPostsButton visible={held > 0} onPress={scroll.toTop} />
      </View>
    </Screen>
  );
}
