import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, LoadingScreen } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import { useMyCircles } from '@features/circles';
import type { ProfileStackParamList } from '@/navigation/types';
import { useWidgetCircle, useSetWidgetCircle } from '../hooks';

type Props = NativeStackScreenProps<ProfileStackParamList, 'WidgetSettings'>;

// How the widget gets new moods differs: iOS fetches on its own, Android shows what LYSM last gave it.
const REFRESH_NOTE =
  Platform.OS === 'ios'
    ? 'The widget checks for new moods on its own. Your phone decides exactly when, usually every 15 to 60 minutes.'
    : 'The widget shows the moods from the last time you opened LYSM, and keeps their times up to date.';

function WidgetRow({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }}>
      <Card className={cn('mb-3', active && 'border-2 border-brand-500')}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text variant="bodyStrong">{label}</Text>
            {sub ? (
              <Text variant="caption" className="mt-0.5">
                {sub}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={active ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={active ? colors.brand[500] : colors['ink-faint']}
          />
        </View>
      </Card>
    </Pressable>
  );
}

export function WidgetSettingsScreen({ navigation }: Props) {
  const circlesQ = useMyCircles();
  const selectedQ = useWidgetCircle();
  const setCircle = useSetWidgetCircle();
  // The widget is for Private circles only — Public circles are never offered.
  const circles = (circlesQ.data ?? []).filter((c) => c.type === 'private');
  const stored = selectedQ.data ?? null;
  // A choice that's no longer offered (e.g. a Public circle picked before this rule) reads as none.
  const selected = circles.some((c) => c.id === stored) ? stored : null;

  return (
    <Screen scroll padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Home Widget</Text>
      </View>

      <View className="px-5">
        <Text variant="bodyMuted" className="mb-5">
          Pick a private circle to show on your home-screen widget. Add the LYSM widget
          from your phone’s home screen, then choose the circle here. {REFRESH_NOTE}
        </Text>

        {circlesQ.isLoading ? (
          <LoadingScreen />
        ) : (
          <>
            <WidgetRow
              label="Don’t show a widget"
              active={selected === null}
              onPress={() => setCircle.mutate(null)}
            />
            {circles.map((c) => (
              <WidgetRow
                key={c.id}
                label={c.name}
                sub="Private Circle"
                active={selected === c.id}
                onPress={() => setCircle.mutate(c.id)}
              />
            ))}
            {circles.length === 0 ? (
              <Text variant="caption" className="mt-1">
                Join or create a private circle first to use the widget.
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
