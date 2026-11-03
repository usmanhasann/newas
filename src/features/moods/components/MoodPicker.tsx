/**
 * Connected multi-mood selector for a single journal entry (overhaul spec §1.2/§1.3).
 * Every entry mood surface uses THIS so the per-entry rule, slot count, and messaging
 * are identical everywhere. The raw MoodSelector stays a presentational primitive;
 * this wires it to the per-entry selection logic (up to 3 moods, replace = free swap).
 */
import { View } from 'react-native';
import { MoodSelector, Text } from '@components';
import { type MoodKey } from '@theme';
import { toast } from '@store/toast';
import {
  ENTRY_MOOD_LIMIT,
  disabledEntryMoodKeys,
  moodSlotsLabel,
  toggleEntryMood,
} from '../entrySelection';

export interface MoodPickerProps {
  /** The entry's selected moods (0..max). */
  value: readonly MoodKey[];
  onChange: (moods: MoodKey[]) => void;
  /** Per-entry cap (defaults to 3). */
  max?: number;
  /** Runs first on any mood tap, e.g. to close the keyboard (first check-in, client 10/14 p.7). */
  onInteract?: () => void;
  /** See MoodSelector: 'handled' lets a tap reach the mood while the keyboard is open. */
  keyboardShouldPersistTaps?: 'never' | 'handled';
}

export function MoodPicker({
  value,
  onChange,
  max = ENTRY_MOOD_LIMIT,
  onInteract,
  keyboardShouldPersistTaps,
}: MoodPickerProps) {
  const disabledKeys = disabledEntryMoodKeys(value, max);
  return (
    <View>
      <MoodSelector
        selected={value}
        onToggle={(m) => {
          onInteract?.();
          onChange(toggleEntryMood(value, m, max));
        }}
        disabledKeys={disabledKeys}
        onDisabledPress={() => {
          onInteract?.();
          toast.info(`You can pick up to ${max} moods per entry. Tap a selected mood to swap it.`);
        }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      />
      <Text variant="caption" className="mt-2">
        {moodSlotsLabel(value.length, max)}
      </Text>
    </View>
  );
}
