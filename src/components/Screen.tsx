/**
 * Screen — safe-area page container with the warm blush background (token: background).
 * Provides optional scrolling and keyboard avoidance. Horizontal padding follows the
 * spec (~20px). Use this as the root of every screen so spacing/background stay uniform.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '@theme';
import { cn } from '@utils/cn';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  scroll?: boolean;
  /** Apply default horizontal padding (px-5). Disable for full-bleed screens. */
  padded?: boolean;
  /** Avoid the keyboard (forms). */
  keyboardAvoiding?: boolean;
  edges?: readonly Edge[];
  className?: string;
  contentClassName?: string;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  keyboardAvoiding = false,
  edges = ['top', 'bottom'],
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const pad = padded ? 'px-5' : '';

  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn('grow', pad, contentClassName)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn('flex-1', pad, contentClassName)}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={{ flex: 1, backgroundColor: colors.background }}
      className={className}
      {...rest}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
