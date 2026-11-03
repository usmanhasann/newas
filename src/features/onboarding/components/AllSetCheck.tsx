/**
 * The "You're all set" icon (client revisions 10/14 p.11, N12): a solid brand purple circle (the
 * Continue button's purple) with a white check inside, and nothing around it (no halo, no dots).
 *
 * Entrance, once, when it appears: the circle pops in (fades in while scaling up from slightly
 * smaller to full size with a slight overshoot), then the check draws itself stroke by stroke.
 * Then everything holds completely still: no loop, no pulse. With Reduce Motion on, the finished
 * icon shows at once. Geometry and timing: ../allSetCheck.ts.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@theme';
import { useReducedMotion } from '@hooks/useReducedMotion';
import {
  ALL_SET_CHECK,
  CHECK_LENGTH,
  CHECK_PATH,
  CHECK_STROKE_WIDTH,
  CHECK_VIEWBOX,
  checkStroke,
} from '../allSetCheck';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function AllSetCheck() {
  const reduced = useReducedMotion();
  const scale = useSharedValue<number>(ALL_SET_CHECK.circleStartScale);
  const fade = useSharedValue(0);
  const draw = useSharedValue(0);
  // The entrance plays once per appearance: a later change of the Reduce Motion setting only ever
  // settles the icon, it never replays it.
  const played = useRef(false);

  useEffect(() => {
    if (reduced || played.current) {
      cancelAnimation(scale);
      cancelAnimation(fade);
      cancelAnimation(draw);
      scale.value = 1;
      fade.value = 1;
      draw.value = 1;
      return;
    }
    played.current = true;
    fade.value = withTiming(1, {
      duration: ALL_SET_CHECK.circleFadeMs,
      easing: Easing.out(Easing.quad),
    });
    scale.value = withTiming(1, {
      duration: ALL_SET_CHECK.circlePopMs,
      easing: Easing.out(Easing.back(ALL_SET_CHECK.circleOvershoot)),
    });
    draw.value = withDelay(
      ALL_SET_CHECK.checkDelayMs,
      withTiming(1, { duration: ALL_SET_CHECK.checkDrawMs, easing: Easing.inOut(Easing.quad) }),
    );
  }, [reduced, scale, fade, draw]);

  const circleStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }],
  }));
  const checkProps = useAnimatedProps(() => checkStroke(draw.value));

  return (
    <Animated.View
      testID="all-set-check"
      style={circleStyle}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Success checkmark"
    >
      <View className="h-36 w-36 items-center justify-center rounded-full bg-brand-500">
        <Svg width="100%" height="100%" viewBox={`0 0 ${CHECK_VIEWBOX} ${CHECK_VIEWBOX}`}>
          <AnimatedPath
            d={CHECK_PATH}
            stroke={colors.white}
            strokeWidth={CHECK_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
            fill="none"
            animatedProps={checkProps}
          />
        </Svg>
      </View>
    </Animated.View>
  );
}
