import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, Button, Fab, LoadingScreen } from '@components';
import { colors } from '@theme';
import { firstName } from '@utils/name';
import { useProfile } from '@features/profile';
import { NotificationBell, NotificationNudgeCard } from '@features/notifications';
import { AcquisitionSheet } from '@features/acquisition';
import { WelcomeReflectionCard } from '@features/welcome-reflection';
import { useEntries, useDailyPrompt, useDeleteEntry } from '../hooks';
import { homeGreeting } from '../logic';
import { SwipeToDeleteEntry, confirmDeleteEntry } from '../components/DeleteEntry';
import { TodaysMoodCard } from '../components/TodaysMoodCard';
import type { JournalStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalHome'>;

/** How many of the newest entries "Recent Entries" previews before its arrow opens the full list. */
export const RECENT_ENTRIES_PREVIEW = 5;

export function JournalHomeScreen({ navigation }: Props) {
  const { data: profile } = useProfile();
  const name = firstName(profile?.display_name);
  // Local device hour drives the greeting (matches the clock the user sees on their phone).
  const greeting = homeGreeting(name, new Date().getHours());
  const prompt = useDailyPrompt();
  const entriesQ = useEntries();
  const del = useDeleteEntry();
  const recent =
    entriesQ.data?.pages.flatMap((p) => p.items).slice(0, RECENT_ENTRIES_PREVIEW) ?? [];

  return (
    <Screen padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
      >
        <View className="flex-row items-start gap-2 py-2">
          <View className="flex-1">
            <Text variant="h1">{greeting}</Text>
            <Text variant="bodyMuted" className="mt-1">
              {/* A blank line holds the space until today’s prompt is known (no stand-in prompt). */}
              {prompt || ' '}
            </Text>
          </View>
          {/* The in-app notifications list (client 10/14 p.8, p.24), with an unread dot. */}
          <NotificationBell onPress={() => navigation.navigate('NotificationsList')} />
        </View>

        {/* A mood tap opens New Entry with that mood chosen; a tap anywhere else on the card opens
            it with no mood chosen, like the + New Entry button (client 10/14 p.6). */}
        <TodaysMoodCard
          onPickMood={(presetMood) => navigation.navigate('NewEntry', { presetMood })}
          onPressCard={() => navigation.navigate('NewEntry')}
        />

        {/* Renders itself only for engaged users who can't currently receive notifications. */}
        <NotificationNudgeCard />

        <View className="mb-3 mt-6 flex-row items-center justify-between">
          <Text variant="section">Recent Entries</Text>
          {recent.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate('AllEntries')}
              accessibilityRole="button"
              accessibilityLabel="View all journal entries"
              hitSlop={12}
              className="h-11 w-11 flex-row items-center justify-end"
            >
              <Ionicons name="arrow-forward" size={20} color={colors.brand[500]} />
            </Pressable>
          ) : null}
        </View>

        {/* The "Welcome reflection" (client 10/14 p.35) sits at the top of the list until the person
            deletes it. It is not an entry, so the list below (and its empty text) is unchanged. It
            renders nothing when there is none. */}
        <WelcomeReflectionCard />

        {entriesQ.isLoading ? (
          <LoadingScreen />
        ) : entriesQ.isError ? (
          <Card className="mt-2">
            <Text variant="bodyStrong">We couldn’t load your entries</Text>
            <Text variant="bodyMuted" className="mt-1">
              Check your connection and try again.
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              size="sm"
              fullWidth={false}
              className="mt-3 self-start"
              loading={entriesQ.isFetching}
              onPress={() => entriesQ.refetch()}
            />
          </Card>
        ) : recent.length === 0 ? (
          <Card className="mt-2">
            <Text variant="bodyStrong">Your journal is empty</Text>
            <Text variant="bodyMuted" className="mt-1">
              Tap + New Entry to log your first mood and write what’s on your mind.
            </Text>
          </Card>
        ) : (
          recent.map((e) => (
            <SwipeToDeleteEntry
              key={e.id}
              entry={e}
              onOpen={() => navigation.navigate('EntryDetail', { entryId: e.id })}
              onDelete={() => confirmDeleteEntry(() => del.mutate(e.id))}
            />
          ))
        )}
      </ScrollView>

      <Fab onPress={() => navigation.navigate('NewEntry')} />

      {/* One-time "How'd you find us?" popup — self-gates (post-onboarding, once ever, ~2.5s delay). */}
      <AcquisitionSheet />
    </Screen>
  );
}
