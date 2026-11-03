/**
 * Deleting a journal entry — the same confirmation everywhere it can happen (Home's Recent
 * Entries, All Entries, and the entry's own page). Deleting is permanent and total: the entry, its
 * AI Insight, and every circle it was shared to (the database cascades those). The streak is never
 * affected: a day stays counted once it was journaled.
 */
import { Alert, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme';
import type { JournalEntry } from '@app-types/database';
import { EntryCard } from './EntryCard';

/** Ask first — it can't be undone. `onConfirm` runs only on "Delete". */
export function confirmDeleteEntry(onConfirm: () => void): void {
  Alert.alert('Delete this entry?', 'This can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/** An entry row that reveals a delete button when swiped left. */
export function SwipeToDeleteEntry({
  entry,
  onOpen,
  onDelete,
}: {
  entry: JournalEntry;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete entry"
          className="mb-3 ml-2 items-center justify-center rounded-lg bg-danger px-6"
        >
          <Ionicons name="trash-outline" size={22} color={colors.white} />
        </Pressable>
      )}
    >
      <EntryCard entry={entry} onPress={onOpen} />
    </ReanimatedSwipeable>
  );
}
