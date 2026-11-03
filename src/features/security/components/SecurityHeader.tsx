/** The back chevron and title at the top of each Sign-in & Security screen (Profile stack style). */
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@components';
import { colors } from '@theme';

export function SecurityHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <Text variant="h3" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}
