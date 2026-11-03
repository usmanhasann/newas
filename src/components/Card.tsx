/**
 * Card — white surface, generous rounding (lg=16), subtle warm border + soft shadow
 * (spec §5.5). Uniform padding so cards are consistent across screens (spec §4 fix).
 */
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { shadow } from '@theme';
import { cn } from '@utils/cn';

export interface CardProps extends ViewProps {
  children: ReactNode;
  padded?: boolean;
  elevated?: boolean;
  className?: string;
}

const BORDER_NOT_COLOR =
  /^border-((0|2|4|8|x|y|t|r|b|l|s|e)(-|$)|solid$|dashed$|dotted$|double$|hidden$|none$|collapse$|separate$|spacing)/;

/** Which of the card's own styles a class sets; null = never conflicts. */
function cardConflictGroup(raw: string): string | null {
  if (!raw || raw.includes(':')) return null; // prefixed (active:, dark:): conditional, not an override
  if (/^bg-(?!opacity)/.test(raw)) return 'bg';
  if (/^border(-(0|2|4|8|\[[^\]]+\]))?$/.test(raw)) return 'border-width';
  if (raw.startsWith('border-') && !BORDER_NOT_COLOR.test(raw)) return 'border-color';
  if (/^rounded(-[a-z0-9]+|-\[[^\]]+\])?$/.test(raw)) return 'radius';
  if (/^p-/.test(raw)) return 'padding';
  return null;
}

/**
 * NativeWind resolves conflicting classes by STYLESHEET order, not className order, and Tailwind
 * emits same-plugin utilities alphabetically: a caller's `border-brand-500` or `bg-brand-50` would
 * silently lose to the card's own `border-line` / `bg-surface`. Drop the card's class in every
 * group the caller sets, so caller classes always win (same approach as Text).
 */
export function resolveCardClasses(padded: boolean, className?: string): string {
  const base = ['rounded-lg', 'border', 'border-line', 'bg-surface', padded ? 'p-5' : ''].filter(Boolean);
  if (!className) return base.join(' ');
  const overridden = new Set(className.split(/\s+/).map(cardConflictGroup));
  const kept = base.filter((cls) => {
    const group = cardConflictGroup(cls);
    return group === null || !overridden.has(group);
  });
  return cn(kept.join(' '), className);
}

export function Card({
  children,
  padded = true,
  elevated = true,
  className,
  style,
  ...rest
}: CardProps) {
  return (
    <View
      className={resolveCardClasses(padded, className)}
      style={[elevated ? shadow.card : null, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
