import { ActivityIndicator, Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Button, Fab, LoadingScreen } from '@components';
import { colors } from '@theme';
import type { JournalStackParamList } from '@/navigation/types';
import { useEntries, useDeleteEntry } from '../hooks';
import { SwipeToDeleteEntry, confirmDeleteEntry } from '../components/DeleteEntry';

type Props = NativeStackScreenProps<JournalStackParamList, 'AllEntries'>;

export function AllEntriesScreen({ navigation }: Props) {
  const entriesQ = useEntries();
  const del = useDeleteEntry();
  const all = entriesQ.data?.pages.flatMap((p) => p.items) ?? [];

  const confirmDelete = (id: string) => confirmDeleteEntry(() => del.mutate(id));

  return (
    <Screen padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">All Entries</Text>
      </View>

      {entriesQ.isLoading ? (
        <LoadingScreen />
      ) : entriesQ.isError ? (
        <View className="mt-24 items-center px-6">
          <Ionicons name="cloud-offline-outline" size={40} color={colors['ink-soft']} />
          <Text variant="h3" className="mt-2 text-center">
            We couldn’t load your entries
          </Text>
          <Text variant="bodyMuted" className="mt-1 text-center">
            Check your connection and try again.
          </Text>
          <Button
            title="Try again"
            variant="secondary"
            fullWidth={false}
            className="mt-4"
            loading={entriesQ.isFetching}
            onPress={() => entriesQ.refetch()}
          />
        </View>
      ) : (
        <FlashList
          data={all}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <SwipeToDeleteEntry
              entry={item}
              onOpen={() => navigation.navigate('EntryDetail', { entryId: item.id })}
              onDelete={() => confirmDelete(item.id)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (entriesQ.hasNextPage && !entriesQ.isFetchingNextPage) entriesQ.fetchNextPage();
          }}
          ListEmptyComponent={
            <View className="mt-24 items-center px-6">
              <Text style={{ fontSize: 40 }}>🌱</Text>
              <Text variant="h3" className="mt-2 text-center">
                No entries yet
              </Text>
              <Text variant="bodyMuted" className="mt-1 text-center">
                Your reflections will appear here. Tap + to begin.
              </Text>
            </View>
          }
          ListFooterComponent={
            entriesQ.isFetchingNextPage ? (
              <ActivityIndicator color={colors.brand[500]} style={{ marginVertical: 16 }} />
            ) : null
          }
        />
      )}

      <Fab onPress={() => navigation.navigate('NewEntry')} />
    </Screen>
  );
}
