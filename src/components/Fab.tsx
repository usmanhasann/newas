import { Pressable } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@theme';
import { Text } from './Typography';

/**
 * Floating action button (design spec §5.7): a brand pill anchored bottom-right showing the
 * icon + `label` ("+ New Entry"). 56px tall; width grows to fit the label.
 */
export function Fab({
  onPress,
  icon = 'add',
  label = 'New Entry',
}: {
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="absolute h-14 flex-row items-center gap-2 rounded-full bg-brand-500 px-5 active:bg-brand-600"
      style={[{ bottom: 24, right: 20 }, shadow.fab]}
    >
      <Ionicons name={icon} size={28} color={colors.white} />
      <Text variant="button" style={{ color: colors.white }}>
        {label}
      </Text>
    </Pressable>
  );
}
