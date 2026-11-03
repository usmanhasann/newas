/** Screen 7 — Reflect-back. Calm, sincere, personalized summary. No progress bar. */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Button, Text } from '@components';
import { useReducedMotion } from '@hooks/useReducedMotion';
import { StepScaffold } from '../../components/StepScaffold';
import { ReflectArt } from '../../components/illustrations';
import { reflectBack } from '../../copy';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

export function ReflectStep({ nav }: StepProps) {
  const reduced = useReducedMotion();

  // The art breathes (scale) + gently floats (translateY) so the screen feels alive — "something
  // is happening" — matching the plan-building graphic on the "You're all set" step. Reduced
  // motion → static.
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    scale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false,
    );
    lift.value = withRepeat(
      withSequence(withTiming(-8, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1,
      false,
    );
  }, [reduced, scale, lift]);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
  }));

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'reflect' });
    trackOnboarding('reflect_back_viewed');
  }, []);

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      centerContent
      footer={<Button title="Sounds right" loading={nav.saving} onPress={() => nav.goNext()} />}
    >
      <View className="items-center">
        <Animated.View style={artStyle}>
          <ReflectArt size={188} />
        </Animated.View>
        {/* Body size (15px) is what has always rendered on device: this step doesn't scroll and the
            reflect-back copy runs ~270–320 chars, so the old (never-applied) text-2xl would overflow. */}
        <Text className="mt-8 text-center font-serif leading-relaxed text-ink">
          {reflectBack(nav.data.frequency, nav.data.goal, nav.data.support)}
        </Text>
      </View>
    </StepScaffold>
  );
}
