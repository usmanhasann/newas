import type { ExpoConfig, ConfigContext } from 'expo/config';
// Native colors come from the design tokens (single source of truth) so the native splash
// background matches the app's runtime background — a seamless hand-off on every launch.
import tokens from './src/theme/tokens.cjs';

/**
 * Expo config. The app ships as a SINGLE identity — ONE app in the stores (`com.lysm.app` /
 * "LYSM"): TestFlight / internal testing → store production, with no separate dev/staging apps.
 * (Collapsed from dev/staging/production variants on 2026-09-04 — the variants had created a
 * duplicate "LYSM (Dev)" app record + confusion.) Client config comes from EXPO_PUBLIC_* env
 * vars (see .env.example); NO server secrets here — privileged keys live in Supabase/EAS secrets.
 *
 * APP_VARIANT is telemetry-only now (Sentry environment + trace sample rate — see src/lib/env.ts
 * and src/lib/sentry.ts). It does NOT change the bundle id, name, or scheme.
 */
const APP_NAME = 'LYSM';
// One bundle id for BOTH ios.bundleIdentifier and android.package. `com.innercircle.app` was
// unavailable (registered to another Apple team), so LYSM uses `com.lysm.app` (matches the owned
// lysm.app domain). The deep-link scheme stays `innercircle` — separate from the bundle id.
const BUNDLE_ID = 'com.lysm.app';
const SCHEME = 'innercircle';
// Shared storage between the app and its iOS home-screen widget (targets/widget): the app writes
// the widget's settings here. The widget target inherits this App Group from ios.entitlements.
const APP_GROUP = `group.${BUNDLE_ID}`;

// Build environment for telemetry only; defaults to production (the shipping app).
const appVariant = process.env.APP_VARIANT ?? 'production';

// Native Google Sign-In needs a reversed-client-id URL scheme in the iOS build. Only wire
// the config plugin when it's provided, so builds work before Google creds exist (the app
// falls back to the in-app browser OAuth flow at runtime — see src/features/auth/social.ts).
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'inner-circle',
  version: '1.0.4',
  // EAS Update (OTA) — the build profiles use channels, so expo-updates needs these two keys.
  // A dynamic app.config.ts can't be auto-written, so they're set here explicitly.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/85ad1c73-e68a-42e6-8a7b-d2ca29c4949d',
  },
  orientation: 'portrait',
  scheme: SCHEME,
  // The app ships a single LIGHT (cream) design — no dark-mode tokens/screens exist. Pin the OS
  // appearance to light so native chrome (date/time pickers, keyboards, alerts) renders light-on-
  // dark-text and matches the UI, instead of following the device into dark mode (which made the
  // inline date picker's text render white-on-cream = invisible). Reverse this if dark mode is added.
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    // Light/dark app icons (official LYSM logo): WHITE letters on the brand purple (#70419e) in
    // BOTH light and dark mode — the wordmark is always white, so it never renders black on any
    // home screen. The light/dark slots are kept for iOS appearance compatibility but both resolve
    // to the same white artwork as the default `icon` (also used for Android, splash, notifications).
    icon: {
      light: './assets/icon-light.png',
      dark: './assets/icon-dark.png',
    },
    bundleIdentifier: BUNDLE_ID,
    // Apple developer team (A&K AI Development LLC) — the home-screen widget extension
    // (@bacons/apple-targets) signs with it.
    appleTeamId: 'G5FPHWH4B4',
    // Native "Sign in with Apple" (App Store requires the native flow, not a web view —
    // spec §3). Needs the capability enabled on the Apple Developer app id + the Apple
    // provider configured in Supabase Auth. Google uses Supabase's in-app browser OAuth.
    usesAppleSignIn: true,
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    // Android shows only the centre 2/3 of an adaptive icon's foreground, so this layer is the
    // icon.png wordmark alone, shrunk to 2/3 on a transparent canvas: on the home screen it then
    // has the same size and margins as the iOS icon (icon.png itself here filled the whole icon).
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#70419e',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    [
      'expo-splash-screen',
      {
        // The splash shows the brand-purple "lysm" wordmark (assets/splash-logo.png — TRANSPARENT
        // background, #70419E letters, matching the app icon) centered on the cream app background.
        // backgroundColor matches colors.background so the native splash → in-app BrandSplash
        // hand-off is seamless. Shown on every cold launch (new or returning) until JS loads.
        backgroundColor: tokens.colors.background,
        image: './assets/splash-logo.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: tokens.colors.brand[500],
      },
    ],
    'expo-image',
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    'expo-apple-authentication',
    // In-app purchases (App Store / Google Play subscriptions, client 10/14 p.32-38): StoreKit 2 +
    // Play Billing via the OpenIAP-based expo-iap module. Native: needs a new build.
    'expo-iap',
    // Native Google Sign-In — only added when the iOS URL scheme is configured (see above).
    ...(googleIosUrlScheme
      ? [
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [
            string,
            { iosUrlScheme: string },
          ],
        ]
      : []),
    '@sentry/react-native',
    // Forces modular headers on GoogleUtilities/RecaptchaInterop so GoogleSignIn's AppCheckCore
    // pod can integrate as a static library (otherwise iOS `pod install` fails). See the plugin.
    './plugins/withGoogleModularHeaders',
    // Android home-screen widget: registers the AppWidgetProvider (+ manifest receiver + layout)
    // that draws the circle moods the InnerCircleWidget module writes. Native + verified only by an
    // Android build on-device.
    './plugins/withMoodWidget',
    // iOS home-screen widget: adds the WidgetKit extension in targets/widget (Large, Private circle
    // moods) + its App Group signing. Native + verified only by an iOS build on-device.
    '@bacons/apple-targets',
  ],
  extra: {
    // The EAS project id is baked in (public, not a secret) so `eas build` always finds the
    // linked project — a dynamic app.config.ts can't be auto-written, so relying on an env var
    // alone broke any build that didn't set EAS_PROJECT_ID. The env var still overrides if set.
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '85ad1c73-e68a-42e6-8a7b-d2ca29c4949d' },
    appVariant: appVariant,
    // Client config is also read directly from EXPO_PUBLIC_* at runtime (src/lib/env.ts).
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  },
  experiments: {
    tsconfigPaths: true,
  },
});
