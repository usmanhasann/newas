import { View } from 'react-native';
import { Screen } from './Screen';
import { Text } from './Typography';

/**
 * Friendly placeholder for screens whose full behavior lands in a later phase.
 * Clearly signals "intentionally not built yet" rather than looking broken.
 */
export function Placeholder({
  title,
  message,
  emoji = '🌱',
}: {
  title: string;
  message: string;
  emoji?: string;
}) {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-3 py-16">
        <Text style={{ fontSize: 44 }}>{emoji}</Text>
        <Text variant="h2" className="text-center">
          {title}
        </Text>
        <Text variant="bodyMuted" className="text-center">
          {message}
        </Text>
      </View>
    </Screen>
  );
}
