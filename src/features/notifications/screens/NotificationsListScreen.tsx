/**
 * The in-app notifications list (client revisions 10/14 p.8 and p.24), opened from the bell at the
 * top right of the Journal tab. Everything the server notified the person about, newest first, a
 * page at a time: circle activity, archived / unarchived circles (even from a circle whose
 * notifications they turned off), new members, reflections and streak reminders. Unread rows are
 * tinted with a dot; opening the list marks them all read (the bell's dot goes), and they keep their
 * tint for this visit. Tapping a row opens what it's about, as its banner or push would.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar, Button, Card, Screen, Text, VerifiedBadge } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import type { JournalStackParamList } from '@/navigation/types';
import { useMarkNotificationsRead, useNotificationsList } from '../hooks';
import {
  notificationSpokenLabel,
  notificationTimeLabel,
  notificationView,
  type NotificationView,
} from '../listModel';
import { useOpenNotificationTarget } from '../openTarget';

type Props = NativeStackScreenProps<JournalStackParamList, 'NotificationsList'>;

/** The person's photo, or the notification's icon when it isn't about someone. */
const LEAD_SIZE = 40;

function NotificationItem({
  view,
  onPress,
}: {
  view: NotificationView;
  onPress: () => void;
}) {
  const time = notificationTimeLabel(view.createdAt);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notificationSpokenLabel(view, time)}
      className={cn(
        'flex-row gap-3 border-b border-line px-5 py-3.5 active:bg-surface-muted',
        view.unread && 'bg-brand-50',
      )}
    >
      {view.avatarUrl ? (
        <Avatar uri={view.avatarUrl} size={LEAD_SIZE} />
      ) : (
        <View
          className="items-center justify-center rounded-full bg-brand-100"
          style={{ width: LEAD_SIZE, height: LEAD_SIZE }}
        >
          <Ionicons name={view.icon} size={20} color={colors.brand[500]} />
        </View>
      )}
      <View className="flex-1">
        <Text variant={view.unread ? 'bodyStrong' : 'body'}>
          {view.verifiedName ? (
            <>
              {view.verifiedName} <VerifiedBadge size="base" />
              {view.text.slice(view.verifiedName.length)}
            </>
          ) : (
            view.text
          )}
        </Text>
        {view.preview ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5">
            {view.preview}
          </Text>
        ) : null}
        <Text variant="meta" className="mt-1">
          {view.label ? `${view.label} · ${time}` : time}
        </Text>
      </View>
      {view.unread ? (
        <View
          testID="notification-unread-dot"
          className="mt-2 h-2 w-2 rounded-full bg-brand-500"
        />
      ) : null}
    </Pressable>
  );
}

export function NotificationsListScreen({ navigation }: Props) {
  const list = useNotificationsList();
  const markRead = useMarkNotificationsRead();
  const open = useOpenNotificationTarget();
  const focused = useIsFocused();
  const views = (list.data?.pages ?? []).flatMap((p) => p.items).map(notificationView);
  const newestUnread = views.find((v) => v.unread)?.id ?? null;

  // Coming back to the list shows what's new since (the first visit loads it already).
  const { refetch } = list;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  // Seen: everything showing is marked read while the list is on screen (the rows keep their tint
  // for this visit). Something new arriving while it's open is marked too.
  const { mutate: markAllRead } = markRead;
  const markedUpTo = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || !newestUnread || markedUpTo.current === newestUnread) return;
    markedUpTo.current = newestUnread;
    markAllRead(undefined, {
      onError: () => {
        markedUpTo.current = null; // tried again on the next load
      },
    });
  }, [focused, newestUnread, markAllRead]);

  const header = (
    <View className="flex-row items-center gap-3 px-5 py-3">
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <Text variant="h3" accessibilityRole="header">
        Notifications
      </Text>
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ActivityIndicator className="mt-10" color={colors.brand[500]} />
      </Screen>
    );
  }

  if (list.isError && !list.data) {
    return (
      <Screen padded={false}>
        {header}
        <Card className="mx-5 mt-4">
          <Text variant="bodyStrong">We couldn’t load your notifications</Text>
          <Text variant="bodyMuted" className="mt-1">
            Check your connection and try again.
          </Text>
          <Button
            title="Try again"
            variant="secondary"
            size="sm"
            fullWidth={false}
            className="mt-3 self-start"
            loading={list.isFetching}
            onPress={() => void list.refetch()}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      {header}
      <FlatList
        data={views}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <NotificationItem view={item} onPress={() => void open(item.target)} />
        )}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            tintColor={colors.brand[500]}
          />
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator className="my-4" color={colors.brand[500]} />
          ) : null
        }
        ListEmptyComponent={
          <View className="mt-16 items-center px-10">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              <Ionicons
                name="notifications-outline"
                size={26}
                color={colors.brand[500]}
              />
            </View>
            <Text variant="bodyStrong" className="mt-4 text-center">
              No notifications yet
            </Text>
            <Text variant="bodyMuted" className="mt-1 text-center">
              When something happens in your circles, or a reflection is ready, it shows
              up here.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </Screen>
  );
}
