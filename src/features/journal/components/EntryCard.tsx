import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text, MoodPillGroup } from '@components';
import { colors } from '@theme';
import { formatEntryDateTime } from '@utils/date';
import { entryMoods } from '../logic';
import type { JournalEntry } from '@app-types/database';

export function EntryCard({
  entry,
  onPress,
}: {
  entry: JournalEntry;
  onPress: () => void;
}) {
  const { date, time } = formatEntryDateTime(entry.created_at);
  const moods = entryMoods(entry);
  // 1–2 moods fit nicely beside the date (original layout). 3 moods can't fit on that line,
  // so they move to a single full-width row BELOW the date instead of wrapping into a corner.
  const moodsBelow = moods.length >= 3;

  const dateBlock = (
    <View>
      <Text variant="bodyStrong">{date}</Text>
      <Text variant="meta" className="mt-0.5">
        {time}
      </Text>
    </View>
  );

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card className="mb-3">
        {moodsBelow ? (
          <>
            {dateBlock}
            <MoodPillGroup moods={moods} className="mt-3" />
          </>
        ) : (
          <View className="flex-row items-start justify-between">
            {dateBlock}
            {moods.length ? (
              <MoodPillGroup moods={moods} className="max-w-[60%] justify-end" />
            ) : null}
          </View>
        )}

        {entry.note ? (
          <Text variant="entry" numberOfLines={2} className="mt-3 text-ink-soft">
            {entry.note}
          </Text>
        ) : null}

        {entry.shared ? (
          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="eye-outline" size={14} color={colors['ink-soft']} />
            <Text variant="caption">Shared with circle</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
