/**
 * On-brand vector illustrations for onboarding (build with react-native-svg so they're
 * crisp at any size and fully token-colored — no raster assets, no extra bundle weight).
 * Soft, calm, abstract compositions that match the warm/purple identity. Each accepts a
 * `size` (width); height is derived from the shared 240×196 viewBox.
 */
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@components';
import { colors } from '@theme';

const b = colors.brand;
const VIEW_W = 240;
const VIEW_H = 196;
const HEART =
  'M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z';
const SPARKLE =
  'M0,-12 C1.6,-4 4,-1.6 12,0 C4,1.6 1.6,4 0,12 C-1.6,4 -4,1.6 -12,0 C-4,-1.6 -1.6,-4 0,-12 Z';

function Frame({
  size,
  label,
  children,
}: {
  size: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <Svg
      width={size}
      height={(size * VIEW_H) / VIEW_W}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      accessible
      accessibilityLabel={label}
    >
      {children}
    </Svg>
  );
}

/** Welcome — soft overlapping shapes cradling a heart. */
export function WelcomeArt({ size = 220 }: { size?: number }) {
  return (
    <Frame size={size} label="A calm, welcoming illustration">
      <Circle cx={120} cy={96} r={82} fill={b[50]} />
      <Circle cx={84} cy={74} r={38} fill={colors.lilac} opacity={0.5} />
      <Circle cx={164} cy={80} r={30} fill={colors['accent-teal']} opacity={0.55} />
      <Circle cx={150} cy={128} r={20} fill={colors['accent-pink']} opacity={0.45} />
      <G transform="translate(96,58) scale(1.5)">
        <Path d={HEART} fill={b[500]} />
      </G>
      <Circle cx={66} cy={130} r={4} fill={b[400]} />
      <Circle cx={176} cy={124} r={3} fill={b[300]} />
      <Circle cx={120} cy={156} r={3} fill={b[200]} />
    </Frame>
  );
}

/** Reflect — concentric ripples, a moment of looking inward. */
export function ReflectArt({ size = 200 }: { size?: number }) {
  return (
    <Frame size={size} label="Concentric ripples illustration">
      <Circle cx={120} cy={98} r={82} fill={b[50]} />
      <Circle cx={120} cy={98} r={58} stroke={b[100]} strokeWidth={8} fill="none" />
      <Circle cx={120} cy={98} r={40} stroke={colors.lilac} strokeWidth={8} fill="none" />
      <Circle cx={120} cy={98} r={22} stroke={b[300]} strokeWidth={8} fill="none" />
      <Circle cx={120} cy={98} r={10} fill={b[500]} />
      <Circle cx={188} cy={58} r={6} fill={colors['accent-pink']} />
      <Circle cx={52} cy={140} r={5} fill={colors['accent-teal']} />
    </Frame>
  );
}

/** Building your plan — a card with assembling rows + a sparkle. */
export function PlanArt({ size = 200 }: { size?: number }) {
  return (
    <Frame size={size} label="Personalized plan illustration">
      <Circle cx={120} cy={98} r={82} fill={b[50]} />
      <Rect x={58} y={52} width={124} height={96} rx={20} fill={colors.surface} />
      <Rect
        x={58}
        y={52}
        width={124}
        height={96}
        rx={20}
        fill="none"
        stroke={b[100]}
        strokeWidth={2}
      />
      <Rect x={74} y={74} width={70} height={11} rx={5.5} fill={b[400]} />
      <Rect x={74} y={96} width={92} height={11} rx={5.5} fill={colors.lilac} />
      <Rect x={74} y={118} width={56} height={11} rx={5.5} fill={b[200]} />
      <G transform="translate(176,54)">
        <Path d={SPARKLE} fill={b[500]} />
      </G>
      <Circle cx={56} cy={150} r={4} fill={colors['accent-pink']} />
    </Frame>
  );
}

/**
 * The two bubbles' shared space, measured from the client's "Two ways to open up" screenshot
 * (ref-onboarding-two-ways-to-open-up.png): two equal rounded bubbles, Public overlapping the
 * bottom right of Private, Private's tail down at its bottom left, Public's at its bottom right.
 * 3 units of margin all round keep the outline from being clipped.
 */
const BUBBLES_W = 452;
const BUBBLES_H = 282;
const PRIVATE_BUBBLE =
  'M31 3 H227 A28 28 0 0 1 255 31 V116 A28 28 0 0 1 227 144 H88 L50 176 V144 H31 A28 28 0 0 1 3 116 V31 A28 28 0 0 1 31 3 Z';
const PUBLIC_BUBBLE =
  'M225 107 H421 A28 28 0 0 1 449 135 V220 A28 28 0 0 1 421 248 H400 V279 L363 248 H225 A28 28 0 0 1 197 220 V135 A28 28 0 0 1 225 107 Z';
/** Each bubble's body (without its tail), where its label is centered. */
const PRIVATE_BODY = { x: 3, y: 3, w: 252, h: 141 };
const PUBLIC_BODY = { x: 197, y: 107, w: 252, h: 141 };

function BubbleLabel({
  body,
  scale,
  icon,
  label,
  color,
}: {
  body: { x: number; y: number; w: number; h: number };
  scale: number;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
}) {
  return (
    <View
      className="absolute flex-row items-center justify-center gap-2"
      style={{
        left: body.x * scale,
        top: body.y * scale,
        width: body.w * scale,
        height: body.h * scale,
      }}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text
        variant="bodyStrong"
        maxFontSizeMultiplier={1.2}
        className="font-sans-bold text-xl"
        style={{ color }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Circles — the client's "two ways to open up" picture: a lavender Private bubble (lock + "Private")
 * with a Public bubble (globe + "Public") overlapping its bottom right. Colors are the Circles tab's
 * own type colors (circle.* tokens), outlines purple and dark green.
 */
export function CirclesArt({ width }: { width: number }) {
  const scale = width / BUBBLES_W;
  const height = BUBBLES_H * scale;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Two speech bubbles: Private and Public"
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${BUBBLES_W} ${BUBBLES_H}`}>
        <Path
          d={PRIVATE_BUBBLE}
          fill={colors.circle['private-bg']}
          stroke={b[500]}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Path
          d={PUBLIC_BUBBLE}
          fill={colors.circle['public-bg']}
          stroke={colors.circle['public-ink']}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      </Svg>
      <BubbleLabel
        body={PRIVATE_BODY}
        scale={scale}
        icon="lock-closed-outline"
        label="Private"
        color={colors.circle['private-ink']}
      />
      <BubbleLabel
        body={PUBLIC_BODY}
        scale={scale}
        icon="globe-outline"
        label="Public"
        color={colors.circle['public-ink']}
      />
    </View>
  );
}
