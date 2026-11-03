/**
 * Mood visuals — MoodDot (colored indicator) and MoodPill (pastel badge with a vector
 * icon + label), per spec §5.3 / §5.5. Moods use a non-emoji Ionicons glyph + color +
 * text label (build task §6); never an emoji. Colors are resolved from the mood tokens
 * at runtime (dynamic by mood key), so values still originate from src/theme/tokens.cjs.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Typography';
import { getMood, type MoodKey } from '@theme';
import { cn } from '@utils/cn';

export interface MoodDotProps {
  mood: MoodKey | string;
  size?: number;
  className?: string;
}

export function MoodDot({ mood, size = 12, className }: MoodDotProps) {
  const def = getMood(mood);
  return (
    <View
      className={cn('rounded-full', className)}
      style={{ width: size, height: size, backgroundColor: def.dot }}
    />
  );
}

export interface MoodPillProps {
  mood: MoodKey | string;
  showIcon?: boolean;
  /** 'lg' enlarges the icon + label (used where the mood should stand out — spec §13). */
  size?: 'sm' | 'lg';
  className?: string;
}

export function MoodPill({ mood, showIcon = true, size = 'sm', className }: MoodPillProps) {
  const def = getMood(mood);
  const large = size === 'lg';
  return (
    <View
      className={cn(
        'flex-row items-center rounded-full',
        large ? 'gap-2 px-4 py-2' : 'gap-1.5 px-3 py-1.5',
        className,
      )}
      style={{ backgroundColor: def.bg }}
      accessibilityRole="text"
      accessibilityLabel={`Mood: ${def.label}`}
    >
      {showIcon ? <Ionicons name={def.icon} size={large ? 20 : 14} color={def.ink} /> : null}
      <Text
        variant={large ? 'bodyStrong' : 'caption'}
        style={{ color: def.ink }}
        className="font-sans-semibold"
      >
        {def.label}
      </Text>
    </View>
  );
}

export interface MoodPillGroupProps {
  /** The entry's moods (1..3). Falls back gracefully to an empty row. */
  moods: readonly (MoodKey | string)[];
  size?: 'sm' | 'lg';
  className?: string;
}

/** Renders an entry's set of moods as wrapping pills (overhaul spec §1.2). */
export function MoodPillGroup({ moods, size = 'sm', className }: MoodPillGroupProps) {
  return (
    <View className={cn('flex-row flex-wrap gap-2', className)}>
      {moods.map((mo, i) => (
        <MoodPill key={`${mo}-${i}`} mood={mo} size={size} />
      ))}
    </View>
  );
}
