import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, Avatar, Button, LoadingScreen, VerifiedBadge } from '@components';
import { colors, shadow } from '@theme';
import { cn } from '@utils/cn';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { notifyEvent } from '@features/notifications';
import type { CirclesStackParamList } from '@/navigation/types';
import type { MemberWithProfile } from '../api';
import {
  useCircle,
  useMembers,
  useSetMemberStatus,
  useRemoveMember,
  useLeaveCircle,
  useBanUser,
} from '../hooks';
import { ArchivedCircleLabel } from '../components/ArchivedCircleLabel';
import { CircleFeed } from '../components/CircleFeed';
import { CircleOwnerByline } from '../components/CircleOwnerByline';
import { NewPostsButton, useNewPostsScroll } from '../components/NewPostsButton';
import { circleHeaderDescription, leaveCircleQuestion } from '../postingLogic';

type Props = NativeStackScreenProps<CirclesStackParamList, 'CircleDetail'>;
type Tab = 'feed' | 'members';

/** The back chevron's size; the description line under the name is indented by the same width. */
const BACK_ICON_SIZE = 26;

export function CircleDetailScreen({ navigation, route }: Props) {
  const { circleId } = route.params;
  // A "new members" notification opens the circle on its Members tab (client 10/14 p.9).
  const openOn = route.params.tab;
  const user = useCurrentUser();
  const { data: circle, isLoading } = useCircle(circleId);
  const membersQ = useMembers(circleId);
  const setStatus = useSetMemberStatus(circleId);
  const removeMember = useRemoveMember(circleId);
  const leave = useLeaveCircle();
  const banUser = useBanUser(circleId);
  const [tab, setTab] = useState<Tab>(openOn ?? 'feed');
  // Opened again from another notification while already showing: switch to the tab it asks for.
  const [shownOpenOn, setShownOpenOn] = useState(openOn);
  if (openOn !== shownOpenOn) {
    setShownOpenOn(openOn);
    if (openOn) setTab(openOn);
  }
  // The ••• menu (members who aren't the owner) drops down just below the top row's icons.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  // Client 10/14 p.7: scrolled down reading older posts, new ones wait (the list doesn't move) and a
  // small "New posts" button at the top takes the person up to them.
  const feedScroll = useNewPostsScroll<ScrollView>();
  const [newPostsWaiting, setNewPostsWaiting] = useState(0);

  if (isLoading) return <LoadingScreen />;
  if (!circle) {
    return (
      <Screen>
        <Text variant="bodyMuted" className="mt-10 text-center">
          This circle isn’t available.
        </Text>
      </Screen>
    );
  }

  const isOwner = circle.owner_id === user?.id;
  const isPublic = circle.type === 'public';
  const archived = !!circle.archived_at;
  const members = membersQ.data ?? [];
  const approved = members.filter((m) => m.membership.status === 'approved');
  const isMember = approved.some((m) => m.membership.user_id === user?.id);
  const requests = members.filter((m) => m.membership.status === 'requested');
  // Client 10/14 p.5 (N7): a circle owned by a verified person names them, badge after the name.
  const verifiedOwner = approved.find((m) => m.membership.role === 'owner' && m.profile?.verified);
  // Public circles show their description under the name; null = no line and no gap.
  const description = circleHeaderDescription(circle);

  // One confirmation for both ways out: the ••• menu and the button at the bottom of Members.
  // Works in an archived circle too (leaving is never blocked by archiving).
  const onLeave = () => {
    setMenuOpen(false);
    const question = leaveCircleQuestion(circle);
    Alert.alert(question.title, question.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leave.mutate(circleId, {
            onSuccess: () => navigation.goBack(),
            onError: () => toast.error('Couldn’t leave the circle. Try again.'),
          }),
      },
    ]);
  };

  const name = (m: MemberWithProfile) => m.profile?.display_name ?? 'Member';

  return (
    <Screen padded={false}>
      <View className="px-5 py-3">
        <View
          className="flex-row items-center gap-3"
          onLayout={(e) => setMenuTop(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color={colors.ink} />
          </Pressable>
          <Text variant="h3" numberOfLines={1} className="flex-1">
            {circle.name}
          </Text>
          <View className="flex-row items-center gap-4">
            {/* This circle's own notification switches — for anyone in it. */}
            {isMember ? (
              <Pressable
                onPress={() => navigation.navigate('CircleNotifications', { circleId })}
                hitSlop={8}
                accessibilityLabel="Notification settings"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.brand[500]} />
              </Pressable>
            ) : null}
            {/* The owner's gear; everyone else gets the ••• menu in the same spot. */}
            {isOwner ? (
              <Pressable
                onPress={() => navigation.navigate('EditCircle', { circleId })}
                hitSlop={8}
                accessibilityLabel="Circle settings"
              >
                <Ionicons name="settings-outline" size={22} color={colors.brand[500]} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setMenuOpen((open) => !open)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Circle options"
                accessibilityState={{ expanded: menuOpen }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.brand[500]} />
              </Pressable>
            )}
            {/* No one new can join an archived circle, so there's no one to invite. */}
            {archived ? null : (
              <Pressable
                onPress={() => navigation.navigate('Invite', { circleId })}
                hitSlop={8}
                accessibilityLabel="Invite people"
              >
                <Ionicons name="person-add-outline" size={22} color={colors.brand[500]} />
              </Pressable>
            )}
          </View>
        </View>
        {description ? (
          <View className="flex-row gap-3" testID="circle-description">
            {/* Lines up under the name, not under the back chevron. */}
            <View style={{ width: BACK_ICON_SIZE }} />
            <Text variant="caption" className="mt-0.5 flex-1">
              {description}
            </Text>
          </View>
        ) : null}
        {verifiedOwner ? (
          <View className="flex-row gap-3" testID="circle-owner">
            <View style={{ width: BACK_ICON_SIZE }} />
            <CircleOwnerByline
              name={verifiedOwner.profile?.display_name}
              className="mt-0.5 flex-1"
            />
          </View>
        ) : null}
        {/* Client 10/14 p.23: a small label at the top of an archived circle, for everyone in it. */}
        {archived ? <ArchivedCircleLabel className="mt-3 self-start" /> : null}
      </View>

      {/* The "New posts" button floats over the top of the list, so the list fills this box. */}
      <View className="flex-1">
        <ScrollView
          {...feedScroll.scrollProps}
          testID="circle-detail-scroll"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          <View className="mb-5 flex-row rounded-full bg-surface-muted p-1">
            {(['feed', 'members'] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  className={cn('flex-1 items-center rounded-full py-2', active && 'bg-brand-500')}
                >
                  <View className="flex-row items-center justify-center gap-1.5">
                    <Text variant="bodyStrong" className={active ? 'text-ink-inverse' : 'text-ink-soft'}>
                      {t === 'feed' ? 'Feed' : `Members (${approved.length})`}
                    </Text>
                    {t === 'members' && isOwner && requests.length > 0 ? (
                      <View
                        className="items-center justify-center rounded-full px-1.5"
                        style={{ backgroundColor: colors.danger, minWidth: 18, height: 18 }}
                      >
                        <Text variant="caption" style={{ color: colors.white }}>
                          {requests.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {tab === 'feed' ? (
            <CircleFeed
              circle={circle}
              isMember={isMember}
              onOpenThread={(postId, replyToId) =>
                navigation.navigate('PostThread', { circleId, postId, replyToId })
              }
              onSeeAll={() => navigation.navigate('CircleFeed', { circleId })}
              holdNewPosts={feedScroll.away}
              onNewPostsWaiting={setNewPostsWaiting}
            />
          ) : (
            <>
              {isOwner && requests.length > 0 ? (
                <>
                  <Text variant="section" className="mb-3">
                    Requests to join
                  </Text>
                  {requests.map((m) => (
                    <Card key={m.membership.id} className="mb-3">
                      <View className="flex-row items-center gap-3">
                        <Avatar uri={m.profile?.avatar_url} size={36} />
                        <Text variant="bodyStrong" className="flex-1">
                          {name(m)}
                          {m.profile?.verified ? (
                            <>
                              {' '}
                              <VerifiedBadge size="base" />
                            </>
                          ) : null}
                        </Text>
                        <Pressable
                          onPress={() =>
                            setStatus.mutate(
                              { memberId: m.membership.id, status: 'approved' },
                              {
                                onSuccess: () =>
                                  notifyEvent({
                                    type: 'added_to_circle',
                                    circle_id: circleId,
                                    user_id: m.membership.user_id,
                                  }),
                              },
                            )
                          }
                          hitSlop={6}
                          className="rounded-full bg-brand-500 px-4 py-1.5"
                        >
                          <Text variant="caption" className="text-ink-inverse">
                            Approve
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => removeMember.mutate(m.membership.id)} hitSlop={6}>
                          <Text variant="caption" className="text-danger-strong">
                            Deny
                          </Text>
                        </Pressable>
                      </View>
                    </Card>
                  ))}
                  <Text variant="section" className="mb-3 mt-4">
                    Members
                  </Text>
                </>
              ) : null}

              {approved.map((m) => {
                const isSelf = m.membership.user_id === user?.id;
                const isCircleOwner = m.membership.role === 'owner';
                return (
                  <Card key={m.membership.id} className="mb-3">
                    <View className="flex-row items-center gap-3">
                      <Avatar uri={m.profile?.avatar_url} size={36} />
                      <View className="flex-1">
                        <Text variant="bodyStrong">
                          {name(m)}
                          {m.profile?.verified ? (
                            <>
                              {' '}
                              <VerifiedBadge size="base" />
                            </>
                          ) : null}
                          {isSelf ? ' (you)' : ''}
                        </Text>
                        {isCircleOwner ? <Text variant="caption">Owner</Text> : null}
                        {m.profile?.bio ? (
                          <Text variant="caption" className="mt-1" numberOfLines={3}>
                            {m.profile.bio}
                          </Text>
                        ) : null}
                      </View>
                      {isOwner && !isSelf && !isCircleOwner ? (
                        <Pressable
                          onPress={() => {
                            const buttons: {
                              text: string;
                              style?: 'cancel' | 'destructive';
                              onPress?: () => void;
                            }[] = [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () => removeMember.mutate(m.membership.id),
                              },
                            ];
                            // A Public Circle is open-join, so a plain removal lets them rejoin — offer
                            // a real ban that blocks re-joining this Circle.
                            if (isPublic) {
                              buttons.push({
                                text: 'Ban (can’t rejoin)',
                                style: 'destructive',
                                onPress: () => banUser.mutate(m.membership.user_id),
                              });
                            }
                            Alert.alert('Manage member', name(m), buttons);
                          }}
                          hitSlop={6}
                        >
                          <Ionicons name="close-circle-outline" size={20} color={colors['ink-soft']} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                );
              })}

              {/* Still here at the bottom of the list too (the ••• menu is the quick way). */}
              {!isOwner ? (
                <Button
                  title="Leave circle"
                  variant="destructive"
                  className="mt-4"
                  loading={leave.isPending}
                  onPress={onLeave}
                />
              ) : null}
            </>
          )}
        </ScrollView>
        <NewPostsButton visible={tab === 'feed' && newPostsWaiting > 0} onPress={feedScroll.toTop} />
      </View>

      {menuOpen && !isOwner ? (
        <>
          {/* Tapping anywhere outside the menu closes it. A sibling of the menu (not its parent), so
              screen readers can still reach "Leave circle"; they close it with the escape gesture. */}
          <Pressable
            testID="circle-menu-backdrop"
            onPress={() => setMenuOpen(false)}
            accessible={false}
            focusable={false}
            importantForAccessibility="no"
            className="absolute inset-0"
          />
          <View
            accessibilityRole="menu"
            accessibilityViewIsModal
            onAccessibilityEscape={() => setMenuOpen(false)}
            className="absolute right-5 rounded-md border border-line bg-surface py-1"
            style={[shadow.card, { top: menuTop }]}
          >
            <Pressable onPress={onLeave} accessibilityRole="menuitem" className="px-5 py-3">
              <Text variant="bodyStrong" className="text-danger-strong">
                Leave circle
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
