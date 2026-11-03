/**
 * "Two ways to open up." — explains the Private vs Public Circles choice (client screen order #13),
 * sitting between the shift screen and the first check-in.
 *
 * LAYOUT (matches the client screenshot, ref-onboarding-two-ways-to-open-up.png): the two
 * overlapping speech bubbles (lock + "Private", globe + "Public"), the serif headline on one line,
 * then two centered lines where "Private Circles" and "Public Circles" are bold in their own colors:
 * "Private Circles are for your closest people." / "Public Circles are open to anyone." Same
 * StepScaffold + centerContent composition as the other value screens, with a "Got it" CTA.
 *
 * COLOR: the Circles tab's own type colors (circle.* tokens): purple for Private, dark green for
 * Public, so the two modes look the same here as on the circle cards.
 */
import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Button, Text } from '@components';
import { colors, spacing } from '@theme';
import { StepScaffold } from '../../components/StepScaffold';
import { CirclesArt } from '../../components/illustrations';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

/** The bubbles' widest size (client screenshot: they span about 83% of a 390pt-wide screen). */
const ART_MAX_WIDTH = spacing[82];

export function CirclesPrivacyStep({ nav }: StepProps) {
  const { width } = useWindowDimensions();
  // The screen's side margins (StepScaffold's px-5) on each side.
  const artWidth = Math.min(width - spacing[5] * 2, ART_MAX_WIDTH);

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'circlesPrivacy' });
  }, []);

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      centerContent
      footer={<Button title="Got it" loading={nav.saving} onPress={() => nav.goNext()} />}
    >
      <View className="items-center">
        <CirclesArt width={artWidth} />

        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          className="mt-14 w-full text-center"
        >
          Two ways to open up.
        </Text>
        <Text variant="bodyMuted" className="mt-5 text-center">
          <Text variant="bodyStrong" style={{ color: colors.circle['private-ink'] }}>
            Private Circles
          </Text>{' '}
          are for your closest people.{'\n'}
          <Text variant="bodyStrong" style={{ color: colors.circle['public-ink'] }}>
            Public Circles
          </Text>{' '}
          are open to anyone.
        </Text>
      </View>
    </StepScaffold>
  );
}
