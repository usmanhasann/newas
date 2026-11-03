/**
 * Improvement / value graph (overhaul spec §7). Shown early — before the quiz questions —
 * to reveal the value up front. Larger + centered, comparing two projected paths:
 * "With LYSM" (steady, rising) vs "Without LYSM" (irregular, flat). Copy is
 * fixed (motivation isn't known yet at this point) via valueGraphCopy — motivational,
 * illustrative wording only (no medical/guaranteed-outcome claims).
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Button, Text } from '@components';
import { colors } from '@theme';
import { StepScaffold } from '../../components/StepScaffold';
import { valueGraphCopy } from '../../copy';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

// Two illustrative series over the same time span. Coordinates are in the SVG viewBox.
const WITH_PTS = [
  [16, 150],
  [76, 120],
  [136, 92],
  [196, 62],
  [256, 40],
  [312, 26],
];
const WITHOUT_PTS = [
  [16, 156],
  [76, 150],
  [136, 158],
  [196, 146],
  [256, 152],
  [312, 148],
];

function line(pts: number[][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}
function area(pts: number[][]): string {
  const top = line(pts);
  const [lastX] = pts[pts.length - 1];
  const [firstX] = pts[0];
  return `${top} L ${lastX} 176 L ${firstX} 176 Z`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function ValueGraphStep({ nav }: StepProps) {
  const copy = valueGraphCopy();

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'valueGraph' });
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
          {copy.title}
        </Text>
        <Text variant="bodyMuted" className="mt-2 text-center">
          {copy.subtitle}
        </Text>

        <View className="mt-8 w-full">
          <Svg width="100%" height={200} viewBox="0 0 328 190">
            <Defs>
              <LinearGradient id="withFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.brand[500]} stopOpacity={0.28} />
                <Stop offset="1" stopColor={colors.brand[500]} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Without LYSM — muted, flat/irregular */}
            <Path d={line(WITHOUT_PTS)} stroke={colors['ink-faint']} strokeWidth={3} fill="none" strokeDasharray="6 6" />

            {/* With LYSM — brand, rising, with a soft area fill */}
            <Path d={area(WITH_PTS)} fill="url(#withFill)" />
            <Path
              d={line(WITH_PTS)}
              stroke={colors.brand[500]}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {WITH_PTS.map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={4} fill={colors.brand[600]} />
            ))}
          </Svg>

          <View className="mt-4 flex-row justify-between px-1">
            <Text variant="caption">Now</Text>
            <Text variant="caption">In a few weeks</Text>
          </View>
        </View>

        <View className="mt-6 w-full gap-2">
          <LegendDot color={colors.brand[500]} label={copy.withLabel} />
          <LegendDot color={colors['ink-faint']} label={copy.withoutLabel} />
        </View>

        <Text variant="caption" className="mt-6 text-center">
          {copy.caption}
        </Text>
      </View>
    </StepScaffold>
  );
}
