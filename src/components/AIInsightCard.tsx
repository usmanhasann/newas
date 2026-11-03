/**
 * AI Insight card (design spec §5.4): purple→pink gradient, sparkle, italic-feel
 * serif body in white. Renders all ai_status states (idle/pending/ready/failed).
 */
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Typography';
import { colors, gradient, borderRadius } from '@theme';
import type { AiStatus } from '@app-types/database';
import { withoutDashes } from '@utils/text';

export function AIInsightCard({
  summary,
  status,
  onRetry,
  label = 'AI Insight',
}: {
  summary?: string | null;
  status: AiStatus;
  onRetry?: () => void;
  label?: string;
}) {
  return (
    <LinearGradient
      colors={gradient.ai as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: borderRadius.lg, padding: 20 }}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={15} color={colors.white} />
        <Text
          variant="section"
          style={{ color: colors.white, opacity: 0.95 }}
          accessibilityRole="header"
        >
          {label}
        </Text>
      </View>

      {status === 'ready' && summary ? (
        <Text className="mt-2 font-serif text-md leading-relaxed" style={{ color: colors.white }}>
          {/* Text saved before the no-dash rule is cleaned on the way in. */}
          {withoutDashes(summary)}
        </Text>
      ) : status === 'pending' ? (
        <Text className="mt-2 font-serif text-md" style={{ color: colors.white, opacity: 0.9 }}>
          Reflecting on your entry…
        </Text>
      ) : status === 'failed' ? (
        <View className="mt-2">
          <Text className="font-serif text-md" style={{ color: colors.white, opacity: 0.95 }}>
            We couldn’t generate an insight this time.
          </Text>
          {onRetry ? (
            <Text onPress={onRetry} className="mt-1 underline" style={{ color: colors.white }}>
              Try again
            </Text>
          ) : null}
        </View>
      ) : status === 'ready' ? (
        <Text className="mt-2 font-serif text-md" style={{ color: colors.white, opacity: 0.9 }}>
          Add a few words to your entry and a gentle reflection will appear here.
        </Text>
      ) : (
        <Text className="mt-2 font-serif text-md" style={{ color: colors.white, opacity: 0.9 }}>
          An insight will appear here soon.
        </Text>
      )}
    </LinearGradient>
  );
}
