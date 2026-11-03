/**
 * The purple card at the top of both paywalls (client revisions 10/14 p.32 to p.37): a small
 * uppercase label after a four-point sparkle, the readable start in white serif, the rest blurred,
 * and a white pill with a lock ("Start your trial to read the rest" / "Subscribe to open your
 * journal."). While the reflection is being written it says "Writing your reflection..."; if it
 * couldn't be written, "Failed to load" with a "Try again" button (p.35).
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  View,
  type TextLayoutEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@components';
import { colors } from '@theme';
import { BlurredText } from './BlurredText';
import { FAILED_TO_LOAD, TRY_AGAIN, WRITING_REFLECTION } from '../paywallCopy';

export type PreviewState = 'writing' | 'ready' | 'failed';

/** The mock's outline four-point sparkle (decorative). */
function Sparkle() {
  return (
    <Svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      testID="sparkle-icon"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M12 2C12.6 7.6 16.4 11.4 22 12C16.4 12.6 12.6 16.4 12 22C11.4 16.4 7.6 12.6 2 12C7.6 11.4 11.4 7.6 12 2Z"
        stroke={colors.white}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const BODY = 'font-serif text-xl leading-snug text-ink-inverse';

export function PreviewCard({
  label,
  state,
  readable,
  blurred,
  blurLines,
  pill,
  onRetry,
  retrying = false,
  measure,
  testID,
}: {
  /** Uppercase label; null while it isn't known yet (the card says it's writing). */
  label: string | null;
  state: PreviewState;
  readable: string;
  blurred: string;
  /** At most this many blurred lines (the card stays compact for a long text). */
  blurLines: number;
  pill: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Lays this text out invisibly at the card's width and reports its lines (Welcome back). */
  measure?: { text: string; onLines: (lines: string[]) => void };
  testID?: string;
}) {
  let body: ReactNode;
  if (state === 'writing') {
    body = (
      <Text className={BODY} accessibilityLiveRegion="polite">
        {WRITING_REFLECTION}
      </Text>
    );
  } else if (state === 'failed') {
    body = (
      <View className="items-start gap-4">
        <Text className={BODY} accessibilityLiveRegion="polite">
          {FAILED_TO_LOAD}
        </Text>
        <Pressable
          onPress={onRetry}
          disabled={!onRetry || retrying}
          accessibilityRole="button"
          accessibilityState={{ disabled: !onRetry || retrying, busy: retrying }}
          className="rounded-full bg-surface px-4 py-2 active:opacity-80"
        >
          <Text className="font-sans-bold text-base text-brand-600">{TRY_AGAIN}</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <View>
        {readable ? <Text className={BODY}>{readable}</Text> : null}
        {blurred ? (
          <BlurredText
            testID="preview-blurred"
            text={blurred}
            numberOfLines={blurLines}
            className={readable ? `${BODY} mt-2` : BODY}
          />
        ) : null}
        <View className="mt-4 flex-row items-center gap-2 self-start rounded-full bg-surface px-4 py-2">
          <Ionicons name="lock-closed-outline" size={16} color={colors.brand[600]} />
          <Text className="font-sans-bold text-base text-brand-600">{pill}</Text>
        </View>
      </View>
    );
  }

  const onTextLayout = measure
    ? (e: NativeSyntheticEvent<TextLayoutEventData>) =>
        measure.onLines(e.nativeEvent.lines.map((l) => l.text))
    : undefined;

  return (
    <View testID={testID} className="rounded-lg bg-brand-600 p-5">
      {label ? (
        <View className="mb-3 flex-row items-center gap-2">
          <Sparkle />
          <Text variant="section" className="text-ink-inverse">
            {label}
          </Text>
        </View>
      ) : null}
      <View>
        {measure ? (
          <Text
            testID="preview-measure"
            className={`${BODY} absolute left-0 right-0 top-0`}
            style={{ opacity: 0 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onTextLayout={onTextLayout}
          >
            {measure.text}
          </Text>
        ) : null}
        {body}
      </View>
    </View>
  );
}
