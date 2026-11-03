/**
 * The bell at the top right of the Journal tab (owner's decision 2026-10-21 for the client's in-app
 * notifications list, 10/14 p.8 and p.24): opens the list; a purple dot shows while anything in it
 * is unread. Checked again each time the Journal tab shows.
 */
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme';
import { useHasUnreadNotifications } from '../hooks';

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const unreadQ = useHasUnreadNotifications();
  const unread = unreadQ.data === true;
  const { refetch } = unreadQ;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unread ? 'Notifications, new' : 'Notifications'}
      className="h-11 w-11 items-center justify-center"
    >
      <Ionicons name="notifications-outline" size={24} color={colors.ink} />
      {unread ? (
        <View
          testID="notification-bell-dot"
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-brand-500"
        />
      ) : null}
    </Pressable>
  );
}
