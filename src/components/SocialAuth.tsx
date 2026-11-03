/**
 * The sign-up / sign-in chooser, shared by the onboarding "Save your progress" step and the
 * "Welcome back" Sign In screen so both use the same layout (client 10/14 p.31-32 + mockups): the
 * real LYSM app icon with the serif headline and gray subtext under it, and at the bottom three
 * "Continue with…" pills in this order: Apple, Google, Email.
 *
 * Provider branding follows each provider's own rules:
 * - Apple: black button, white Apple logo, white "Continue with Apple" title (the only colours
 *   Apple allows). A custom button, which Apple permits so its logo and title line up with the
 *   other sign-in buttons, and it is the same size as them. iOS only: render when Apple is available.
 * - Google: Google's official multi-colour "G" mark (colours are the colors.google.* tokens).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, shadow, spacing } from '@theme';
import { cn } from '@utils/cn';
import { openLegalPage, PRIVACY_POLICY_URL, TERMS_URL } from '@lib/legal';
import { Text } from './Typography';

const APP_ICON_IMAGE = require('../../assets/icon.png');

/** Height of every "Continue with…" pill (client mockup: about 58px). */
const PROVIDER_BUTTON_HEIGHT = spacing[14];

/**
 * App icon sizes: `lg` above the sign-up / sign-in headline (client: about 90px wide); `md` on the
 * email form screens, which also need room for the keyboard. Corners keep the icon's proportion.
 */
const APP_ICON = {
  lg: { width: spacing[22], height: spacing[22], borderRadius: borderRadius.lg },
  md: { width: spacing[16], height: spacing[16], borderRadius: borderRadius.md },
} as const;

/**
 * The real LYSM app icon (assets/icon.png, the home-screen icon) as a rounded square with a soft
 * purple glow beneath it. The tile behind the image gives Android's shadow a shape to cast.
 */
export function AppIconTile({ size: sizeName = 'lg' }: { size?: keyof typeof APP_ICON }) {
  const size = APP_ICON[sizeName];
  return (
    <View
      testID="app-icon"
      accessible
      accessibilityRole="image"
      accessibilityLabel="LYSM"
      className="bg-brand-500"
      style={[shadow.fab, size]}
    >
      <Image source={APP_ICON_IMAGE} style={size} />
    </View>
  );
}

/** App icon, then the one-line serif headline, then the smaller gray subtext; all centred. */
export function AuthHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="items-center">
      <AppIconTile />
      {/* One line on every phone: w-full gives adjustsFontSizeToFit a width to shrink within
          (a 360dp Android phone or a large system font) instead of wrapping. */}
      <Text
        variant="h1"
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
        className="mt-6 w-full text-center font-serif-bold text-headline"
      >
        {title}
      </Text>
      <Text
        variant="bodyMuted"
        maxFontSizeMultiplier={1.3}
        className="mt-2 text-center text-md"
      >
        {subtitle}
      </Text>
    </View>
  );
}

type AuthTone = 'apple' | 'neutral';

const TONE: Record<AuthTone, { container: string; title: string; spinner: string }> = {
  // Apple's rules: solid black, white logo + title, no visible border.
  apple: {
    container: 'border-black bg-black active:opacity-80',
    title: 'text-white',
    spinner: colors.white,
  },
  // Google and Email: white with a thin light warm-gray border and dark text.
  neutral: {
    container: 'border-line-strong bg-surface active:bg-surface-muted',
    title: 'text-ink',
    spinner: colors.ink,
  },
};

/**
 * One "Continue with…" pill: full width, fully rounded, its icon right next to its one-line title
 * with both centred. `loading` = this is the sign-in in progress: a spinner in place of its icon,
 * title kept, NOT dimmed. `disabled` = another sign-in is in progress: grayed out with its normal
 * icon and title (client 10/14 p.32: the spinner only on the tapped button).
 */
function AuthProviderButton({
  title,
  icon,
  onPress,
  disabled = false,
  loading = false,
  tone = 'neutral',
}: {
  title: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: AuthTone;
}) {
  const inactive = disabled || loading;
  const t = TONE[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      // Fire and forget: a sign-in runs until its sheet / browser closes; the tap itself is done.
      onPress={() => {
        onPress();
      }}
      className={cn(
        'w-full flex-row items-center justify-center gap-2.5 rounded-full border px-5',
        t.container,
        disabled && !loading && 'opacity-50',
      )}
      style={{ height: PROVIDER_BUTTON_HEIGHT }}
    >
      {/* Fixed slot, so the spinner takes the icon's place without moving the title. */}
      <View className="h-6 w-6 items-center justify-center">
        {loading ? <ActivityIndicator color={t.spinner} /> : icon}
      </View>
      <Text
        variant="bodyStrong"
        className={cn('shrink text-lg', t.title)}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.2}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export type AuthProviderId = 'apple' | 'google' | 'email';

/**
 * The three sign-in options, stacked in the client's order: Apple (where available: iOS), Google,
 * Email. `busy` = the sign-in in progress: only that button spins, the others are grayed out.
 * A button shows only when its handler is given (account linking offers just the ones that fit).
 */
export function AuthProviderButtons({
  appleAvailable,
  busy,
  onApple,
  onGoogle,
  onEmail,
}: {
  appleAvailable: boolean;
  busy: AuthProviderId | null;
  onApple?: () => void;
  onGoogle?: () => void;
  onEmail?: () => void;
}) {
  const state = (id: AuthProviderId) => ({
    loading: busy === id,
    disabled: busy !== null && busy !== id,
  });
  return (
    <View className="w-full gap-3">
      {appleAvailable && onApple ? (
        <AuthProviderButton
          title="Continue with Apple"
          tone="apple"
          icon={<Ionicons name="logo-apple" size={20} color={colors.white} />}
          onPress={onApple}
          {...state('apple')}
        />
      ) : null}
      {onGoogle ? (
        <AuthProviderButton
          title="Continue with Google"
          icon={<GoogleGLogo size={20} />}
          onPress={onGoogle}
          {...state('google')}
        />
      ) : null}
      {onEmail ? (
        <AuthProviderButton
          title="Continue with Email"
          icon={<Ionicons name="mail-outline" size={20} color={colors.brand[600]} />}
          onPress={onEmail}
          {...state('email')}
        />
      ) : null}
    </View>
  );
}

/**
 * Small gray line under the sign-up buttons; "Terms" and "Privacy Policy" are purple underlined
 * links that open those pages, and the final period stays gray.
 */
export function LegalNotice() {
  return (
    <Text variant="caption" maxFontSizeMultiplier={1.3} className="text-center text-sm">
      By continuing, you agree to our{' '}
      <Text
        variant="caption"
        accessibilityRole="link"
        onPress={() => void openLegalPage(TERMS_URL)}
        className="text-sm text-brand-600 underline"
      >
        Terms
      </Text>{' '}
      and{' '}
      <Text
        variant="caption"
        accessibilityRole="link"
        onPress={() => void openLegalPage(PRIVACY_POLICY_URL)}
        className="text-sm text-brand-600 underline"
      >
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

/** Google's official "G" logo (blue, green, yellow, red). Decorative — the button label names it. */
function GoogleGLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      testID="google-g-logo"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        fill={colors.google.red}
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill={colors.google.blue}
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill={colors.google.yellow}
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill={colors.google.green}
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}
