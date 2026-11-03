/**
 * Button — primary CTA is a full-width solid brand pill with a soft on-brand shadow
 * for a premium, tactile feel (spec §5.1). Variants differentiate intent so a
 * destructive action never looks like a positive one. Press feedback via the `active:`
 * background. API unchanged.
 */
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReactNode } from 'react';
import { Text } from './Typography';
import { cn } from '@utils/cn';
import { colors, shadow } from '@theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  // White + border like `outline`, but brand-purple label/icon — the one sign-in option that's ours.
  | 'outlineBrand'
  | 'ghost'
  | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 active:bg-brand-600',
  secondary: 'bg-brand-50 active:bg-brand-100',
  outline: 'bg-surface border border-line-strong active:bg-surface-muted',
  outlineBrand: 'bg-surface border border-line-strong active:bg-surface-muted',
  ghost: 'bg-transparent active:bg-surface-muted',
  destructive: 'bg-transparent border border-danger active:bg-danger/10',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-ink-inverse',
  secondary: 'text-brand-600',
  outline: 'text-ink',
  outlineBrand: 'text-brand-600',
  ghost: 'text-brand-600',
  destructive: 'text-danger-strong',
};

const SIZE: Record<ButtonSize, string> = {
  lg: 'py-4 px-6',
  md: 'py-3 px-5',
  sm: 'py-2.5 px-4',
};

const SPINNER: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.brand[600],
  outline: colors.ink,
  outlineBrand: colors.brand[600],
  ghost: colors.brand[600],
  destructive: colors['danger-strong'],
};

// Resting elevation per variant — only filled/outlined surfaces lift.
const ELEVATION: Record<ButtonVariant, ViewStyle | null> = {
  primary: shadow.brand,
  secondary: shadow.subtle,
  outline: shadow.subtle,
  outlineBrand: shadow.subtle,
  ghost: null,
  destructive: null,
};

export function Button({
  title,
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = true,
  leftIcon,
  rightIcon,
  disabled,
  className,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const elevation = isDisabled ? null : ELEVATION[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center rounded-2xl',
        SIZE[size],
        CONTAINER[variant],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
      style={[elevation, style]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER[variant]} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {leftIcon}
          <Text variant="button" className={LABEL[variant]}>
            {title}
          </Text>
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}
