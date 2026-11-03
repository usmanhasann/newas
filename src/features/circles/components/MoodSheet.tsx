import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Text } from '@components';
import { colors, type MoodKey } from '@theme';
import { MoodPicker } from '@features/moods';

/**
 * The optional mood picker behind a composer's "Mood" button: the same circular mood icons as the
 * check-in, up to 3. "Done" keeps the pick, "Clear" removes it; tapping outside changes nothing.
 */
export function MoodSheet({
  visible,
  value,
  onDone,
  onClose,
}: {
  visible: boolean;
  value: readonly MoodKey[];
  onDone: (moods: MoodKey[]) => void;
  onClose: () => void;
}) {
  // Starts from the message's current moods each time it opens (the composer remounts it).
  const [draft, setDraft] = useState<MoodKey[]>([...value]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close mood picker"
        className="flex-1 justify-end"
        style={{ backgroundColor: colors.overlay }}
      >
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          className="rounded-t-3xl bg-surface px-5 pb-8 pt-3"
        >
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-line-strong" />
          </View>
          <Text variant="h3">How are you feeling?</Text>
          <Text variant="caption" className="mb-4 mt-1">
            Optional. Adds your mood to this message.
          </Text>
          <MoodPicker value={draft} onChange={setDraft} />
          <View className="mt-5 flex-row gap-3">
            <Button
              title="Clear"
              variant="outline"
              fullWidth={false}
              className="flex-1"
              onPress={() => onDone([])}
            />
            <Button title="Done" fullWidth={false} className="flex-1" onPress={() => onDone(draft)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
