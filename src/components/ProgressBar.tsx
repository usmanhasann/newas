/**
 * Slim progress bar with an optional "N of M" label. Token-driven. Exposes the
 * progressbar a11y role + value so screen readers announce progress.
 */
import { View } from 'react-native';
import { Text } from './Typography';
import { colors } from '@theme';
import { cn } from '@utils/cn';

export interface ProgressBarProps {
  /** 1-based current position. */
  step: number;
  total: number;
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({ step, total, showLabel = true, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(step, total));
  const remaining = Math.max(0, total - clamped);
  const label = `${clamped} of ${total}`;

  return (
    <View
      className={cn('w-full', className)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: clamped, text: label }}
    >
      {/* flex proportions avoid percentage-string width typing issues */}
      <View
        className="h-2 w-full flex-row overflow-hidden rounded-full"
        style={{ backgroundColor: colors['surface-sunken'] }}
      >
        <View style={{ flex: clamped, backgroundColor: colors.brand[500], borderRadius: 9999 }} />
        <View style={{ flex: remaining }} />
      </View>
      {showLabel ? (
        <Text variant="caption" className="mt-1.5">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
