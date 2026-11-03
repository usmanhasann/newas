/**
 * Branded loading / splash screen (overhaul spec §2). At COLD LAUNCH the native splash is
 * held up (App.tsx / RootNavigator) until the first real screen is ready, so this is not
 * seen at startup. It appears for in-session routing holds instead — e.g. the sign-out →
 * fresh-anonymous swap — and as the gate's splash fallback. Matches the native splash
 * background so any hand-off is seamless.
 */
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@theme';
import { Text } from './Typography';

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View
      className="flex-1 items-center justify-center gap-6"
      style={{ backgroundColor: colors.background }}
    >
      <Text className="font-serif text-4xl" style={{ color: colors.brand[600] }}>
        LYSM
      </Text>
      <ActivityIndicator size="large" color={colors.brand[500]} />
      {message ? <Text variant="bodyMuted">{message}</Text> : null}
    </View>
  );
}
