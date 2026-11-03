/**
 * Text drawn blurred, for the locked part of the paywall's purple card ("The rest of the reflection
 * blurred", client 10/14 p.33; the last entry's rest on Welcome back, p.37). React Native has no
 * cross-platform text blur (no native blur module in the app), so the text is drawn as a grid of
 * faint copies offset around its place, each with a soft glow of its own colour (the blur tokens): the
 * strokes smear into a soft haze on iOS and Android alike, and it can't be read. A clear copy at
 * opacity 0 sizes the box.
 *
 * Hidden from screen readers: the locked text is not read out.
 */
import { View } from 'react-native';
import { Text } from '@components';
import { blur, colors } from '@theme';

/** Every copy's offset (x, y), on a grid around the text's own place. */
function blurOffsets(): [number, number][] {
  const { radius, step } = blur;
  const out: [number, number][] = [];
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dy = -radius; dy <= radius; dy += step) out.push([dx, dy]);
  }
  return out;
}

const OFFSETS = blurOffsets();

export function BlurredText({
  text,
  numberOfLines,
  className,
  glowColor = colors.white,
  testID,
}: {
  text: string;
  numberOfLines?: number;
  /** The text's typography and colour. */
  className?: string;
  /** The text colour again, for the glow (a style value, not a class). */
  glowColor?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Text className={className} numberOfLines={numberOfLines} style={{ opacity: 0 }}>
        {text}
      </Text>
      {OFFSETS.map(([dx, dy]) => (
        <Text
          key={`${dx},${dy}`}
          className={className}
          numberOfLines={numberOfLines}
          style={{
            position: 'absolute',
            top: dy,
            left: dx,
            right: -dx,
            opacity: blur.opacity,
            textShadowColor: glowColor,
            textShadowRadius: blur.shadow,
            textShadowOffset: { width: 0, height: 0 },
          }}
        >
          {text}
        </Text>
      ))}
    </View>
  );
}
