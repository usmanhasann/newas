/**
 * One Weekly/Monthly/Yearly reflection card on the Insights page (§7/§8). Uses the same
 * branded treatment as the AI Insight card — purple→pink gradient (gradient.ai),
 * sparkles icon, white serif body — the standard for these "insight" cards. Renders the
 * lifecycle state (locked placeholder, generating, failed +retry, or the static
 * reflection) and always shows the server-computed next-unlock date. White-on-gradient
 * keeps AA contrast; meaning is never color-only (text labels + accessible unlock label).
 */
import { ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button } from '@components';
import { colors, gradient, borderRadius } from '@theme';
import { formatLongLocalDate, formatLocalRange } from '@utils/date';
import { withoutClosingQuestion, withoutDashes } from '@utils/text';
import type { ReflectionOverview } from '../api';
import {
  REFLECTION_EMPTY,
  REFLECTION_TITLE,
  REFLECTION_PLACEHOLDER,
  reflectionCardState,
  nextUnlockSentence,
  readyOnSentence,
} from '../logic';

const WHITE = colors.white;

export function ReflectionCard({
  overview,
  onRetry,
  retrying,
  requestSettled = false,
}: {
  overview: ReflectionOverview;
  onRetry: () => void;
  retrying: boolean;
  /** The request to make due reflections finished without making this one (see reflectionCardState). */
  requestSettled?: boolean;
}) {
  const state = reflectionCardState(overview, requestSettled);
  const title = REFLECTION_TITLE[overview.type];
  const unlockDate = formatLongLocalDate(overview.nextUnlockDate);
  // Not ready yet (no period finished): "Ready on [date]." Otherwise the next one's date.
  const unlockLine = !unlockDate
    ? null
    : state === 'locked'
      ? readyOnSentence(unlockDate)
      : nextUnlockSentence(unlockDate);
  const range = formatLocalRange(overview.periodStart, overview.periodEnd);

  return (
    <LinearGradient
      colors={gradient.ai as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: borderRadius.lg, padding: 20 }}
    >
      <View className="mb-2 flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={15} color={WHITE} />
        <Text
          variant="section"
          style={{ color: WHITE, opacity: 0.95 }}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>

      {state === 'ready' ? (
        <>
          <Text className="font-serif text-md leading-relaxed" style={{ color: WHITE }}>
            {/* Reflections saved before the no-dash / no-closing-question rules are cleaned here. */}
            {withoutClosingQuestion(withoutDashes(overview.content ?? ''))}
          </Text>
          {range ? (
            <Text variant="meta" className="mt-2" style={{ color: WHITE, opacity: 0.8 }}>
              Reflecting on {range}
            </Text>
          ) : null}
        </>
      ) : state === 'empty' ? (
        <>
          {/* Only the reflection text is replaced: the period and the next date still show. */}
          <Text className="leading-relaxed" style={{ color: WHITE }}>
            {REFLECTION_EMPTY}
          </Text>
          {range ? (
            <Text variant="meta" className="mt-2" style={{ color: WHITE, opacity: 0.8 }}>
              Reflecting on {range}
            </Text>
          ) : null}
        </>
      ) : state === 'generating' ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator color={WHITE} />
          <Text style={{ color: WHITE }}>Your reflection is being prepared…</Text>
        </View>
      ) : state === 'failed' ? (
        <>
          <Text className="leading-relaxed" style={{ color: WHITE }}>
            We couldn’t prepare this reflection. Please try again.
          </Text>
          <Button
            title="Try again"
            variant="secondary"
            size="sm"
            fullWidth={false}
            className="mt-3 self-start"
            loading={retrying}
            onPress={onRetry}
          />
        </>
      ) : (
        <Text className="leading-relaxed" style={{ color: WHITE }}>
          {REFLECTION_PLACEHOLDER[overview.type]}
        </Text>
      )}

      {state === 'generating' || unlockLine ? (
        <Text
          variant="caption"
          className="mt-3"
          style={{ color: WHITE, opacity: 0.85 }}
          accessibilityLabel={state === 'generating' ? 'Reflection in progress' : (unlockLine ?? undefined)}
        >
          {state === 'generating' ? 'Finishing up your reflection…' : unlockLine}
        </Text>
      ) : null}
    </LinearGradient>
  );
}
