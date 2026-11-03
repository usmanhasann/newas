/**
 * One row on the Sign-in & Security screen, styled like the Profile menu rows: an icon, the label,
 * the value and an optional note under it. Without `onPress` the row is read-only (a lock instead
 * of the chevron), e.g. the email of a Google / Apple only account.
 */
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@components';
import { colors } from '@theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface SecurityRowProps {
  icon: IoniconName;
  label: string;
  value?: string;
  note?: string;
  onPress?: () => void;
}

export function SecurityRow({ icon, label, value, note, onPress }: SecurityRowProps) {
  const readOnly = !onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={readOnly}
      accessibilityRole="button"
      accessibilityState={{ disabled: readOnly }}
      accessibilityLabel={[label, value, note].filter(Boolean).join(', ')}
    >
      <Card padded={false} className="mb-3 px-4 py-3">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={icon} size={20} color={colors.brand[500]} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong">{label}</Text>
            {value ? (
              <Text variant="bodyMuted" className="mt-0.5" numberOfLines={1}>
                {value}
              </Text>
            ) : null}
            {note ? (
              <Text variant="caption" className="mt-0.5">
                {note}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={readOnly ? 'lock-closed-outline' : 'chevron-forward'}
            size={18}
            color={colors['ink-faint']}
          />
        </View>
      </Card>
    </Pressable>
  );
}
