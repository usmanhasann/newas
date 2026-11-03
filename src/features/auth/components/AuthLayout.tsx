/**
 * Shared auth screen scaffold: brand mark + heading + subtitle, then form content.
 * Keeps Login/SignUp/Forgot/Reset visually consistent (design spec §6.1–6.2, §6.12).
 * The brand mark is the real LYSM app icon, as on Sign In and "Save your progress" (client 10/14
 * p.31: it replaces the purple heart circle), a size smaller to leave room for the form.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppIconTile, Screen, Text, Card } from '@components';
import { cn } from '@utils/cn';

export function AuthErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Card
      elevated={false}
      className="border-danger/40 bg-danger/10"
      accessibilityLiveRegion="polite"
    >
      <Text variant="body" className="text-danger-strong">
        {message}
      </Text>
    </Card>
  );
}

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Top spacing for the header — bump it (e.g. "mt-12") to nudge the whole screen down.
   *  Defaults to "mt-4". */
  headerTopClass?: string;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  headerTopClass = 'mt-4',
}: AuthLayoutProps) {
  return (
    <Screen scroll keyboardAvoiding contentClassName="py-8">
      <View className={cn('mb-8 items-center', headerTopClass)}>
        <AppIconTile size="md" />
        {/* Keep the display heading on ONE line — the serif h1 otherwise wraps a two-word
            title like "Welcome back" on narrower screens / larger system fonts. w-full gives
            a definite width so adjustsFontSizeToFit shrinks (only if truly needed) instead of
            wrapping. */}
        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          className="mt-4 w-full text-center"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMuted" className="mt-1.5 text-center">
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View className="gap-4">{children}</View>

      {footer ? <View className="mt-8 items-center gap-3">{footer}</View> : null}
    </Screen>
  );
}
