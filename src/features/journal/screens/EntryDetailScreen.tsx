import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, MoodPillGroup, AIInsightCard, LoadingScreen } from '@components';
import { colors } from '@theme';
import { formatEntryDateTime } from '@utils/date';
import { useGenerateSummary } from '@features/ai-summary';
import { useEntryShares } from '@features/circles';
import { CrisisSupportMessage } from '@features/crisis';
import type { JournalStackParamList } from '@/navigation/types';
import { useDeleteEntry, useEntry } from '../hooks';
import { confirmDeleteEntry } from '../components/DeleteEntry';
import { entryMoods } from '../logic';

type Props = NativeStackScreenProps<JournalStackParamList, 'EntryDetail'>;

export function EntryDetailScreen({ navigation, route }: Props) {
  const { entryId } = route.params;
  const { data: entry, isLoading } = useEntry(entryId);
  const gen = useGenerateSummary(entryId);
  const del = useDeleteEntry();
  const shares = useEntryShares(entryId);

  // Auto-generate the insight once when the entry has a note but no summary yet. Never for an entry
  // with concerning words: it gets no AI reflection, and its text is never sent (client 10/14 p.36).
  useEffect(() => {
    if (entry && entry.note && entry.ai_status === 'idle' && !entry.crisis_flagged && !gen.isPending) {
      gen.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, entry?.ai_status]);

  if (isLoading) return <LoadingScreen />;
  if (!entry) {
    return (
      <Screen>
        <Text variant="bodyMuted" className="mt-10 text-center">
          This entry couldn’t be found.
        </Text>
      </Screen>
    );
  }

  const { date, time } = formatEntryDateTime(entry.created_at);
  // Every circle it's in, including ones left or archived since (members there still see it).
  // Until that's known, the entry's own "shared" flag decides, so it never reads Private wrongly.
  const sharedIn = shares.data ? shares.data.circles.map((c) => c.circleName) : null;
  const isShared = sharedIn ? sharedIn.length > 0 : entry.shared;

  return (
    <Screen>
      <View className="flex-row items-center justify-between py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Entry Detail</Text>
        <View className="flex-row items-center gap-5">
          <Pressable
            onPress={() =>
              confirmDeleteEntry(() =>
                del.mutate(entry.id, { onSuccess: () => navigation.goBack() }),
              )
            }
            disabled={del.isPending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Delete entry"
          >
            <Ionicons name="trash-outline" size={21} color={colors['danger-strong']} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('NewEntry', { entryId: entry.id })}
            hitSlop={8}
            accessibilityLabel="Edit entry"
          >
            <Ionicons name="pencil" size={20} color={colors.brand[500]} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text variant="meta" className="text-brand-500">
          {date} · {time}
        </Text>

        <View className="mt-3">
          <MoodPillGroup moods={entryMoods(entry)} />
        </View>

        <View className="mt-5">
          {entry.crisis_flagged ? (
            // Where the reflection would be: a short message and the 988 and Crisis Text Line options.
            <CrisisSupportMessage />
          ) : (
            <AIInsightCard
              summary={entry.ai_summary}
              status={entry.ai_status}
              onRetry={() => gen.mutate()}
            />
          )}
        </View>

        <Text variant="section" className="mb-2 mt-6">
          Your Entry
        </Text>
        <Text variant="entry">{entry.note ?? 'No note for this entry.'}</Text>

        <Text variant="section" className="mb-2 mt-6">
          Sharing
        </Text>
        <Card elevated={false} className="bg-surface-muted">
          <View className="flex-row items-center gap-2">
            <Ionicons
              name={isShared ? 'people' : 'lock-closed'}
              size={16}
              color={colors['ink-soft']}
            />
            <Text variant="body" className="flex-1">
              {isShared
                ? sharedIn?.length
                  ? `Shared with ${sharedIn.join(', ')}`
                  : 'Shared with your circle'
                : 'Private: only you can see this'}
            </Text>
          </View>
          {isShared ? (
            <Text variant="caption" className="mt-1">
              {shares.data?.version === 'written'
                ? 'They see this entry as written, with your mood.'
                : 'They see its AI reflection, with your mood. Your words stay private.'}
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
