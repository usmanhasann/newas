/**
 * "The shift you're working toward" (opens the value stretch, right after the tone question).
 * A personalized NOW → AHEAD contrast: the user's current state (from their frequency answer)
 * against the goal they picked, so the destination feels real and within reach. Distinct from
 * the earlier value graph (a chart) — this is a two-card contrast. Motivational / illustrative
 * only, no guarantees.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@components';
import { colors } from '@theme';
import { StepScaffold } from '../../components/StepScaffold';
import { goalOutcomeLabel, stressStateLabel } from '../../copy';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

export function ShiftStep({ nav }: StepProps) {
  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'shift' });
  }, []);

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      centerContent
      footer={<Button title="Continue" loading={nav.saving} onPress={() => nav.goNext()} />}
    >
      <View className="items-center">
        <Text variant="h1" className="text-center">
          The shift you’re working toward
        </Text>
        <Text variant="bodyMuted" className="mt-2 text-center">
          Built from what you told us, and closer than it feels.
        </Text>

        <View className="mt-10 w-full gap-2">
          <Card>
            <Text variant="caption">Right now</Text>
            <Text variant="bodyStrong" className="mt-1">
              {stressStateLabel(nav.data.frequency)}
            </Text>
          </Card>

          <View className="items-center py-1">
            <Ionicons name="arrow-down" size={22} color={colors.brand[500]} />
          </View>

          <Card className="border-2 border-brand-500 bg-brand-50">
            <Text variant="caption" className="text-brand-600">
              With LYSM
            </Text>
            <Text variant="bodyStrong" className="mt-1">
              {goalOutcomeLabel(nav.data.goal)}
            </Text>
          </Card>
        </View>

        <Text variant="caption" className="mt-8 text-center">
          Small, steady check-ins are how you get from one to the other.
        </Text>
      </View>
    </StepScaffold>
  );
}
