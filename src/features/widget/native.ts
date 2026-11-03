/**
 * Where each platform's home-screen widget reads from. Both are OPTIONAL at runtime — in Expo Go,
 * tests, or a build without the widget, every call here no-ops safely.
 *
 * - iOS: the App Group shared with the WidgetKit extension (targets/widget). The iOS widget fetches
 *   its own data on iOS's schedule, so the app only hands it its settings: the read-only widget key,
 *   the chosen circle, and where to fetch from.
 * - Android: SharedPreferences via the InnerCircleWidget module (modules/widget). The Android widget
 *   can't fetch, so the app writes the feed itself; the widget re-applies the time rules on redraw.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { ExtensionStorage } from '@bacons/apple-targets';

// The App Group declared in app.config.ts (ios.entitlements) — the widget target reads the same one.
const APP_GROUP =
  (
    Constants.expoConfig?.ios?.entitlements?.['com.apple.security.application-groups'] as
      | string[]
      | undefined
  )?.[0] ?? 'group.com.lysm.app';

/** App Group keys the iOS widget reads (targets/widget/CircleMoodsWidget.swift → `Shared`). */
export const IOS_WIDGET_KEYS = {
  key: 'widget.key',
  circleId: 'widget.circleId',
  feedUrl: 'widget.feedUrl',
  apiKey: 'widget.apiKey',
} as const;

/** What the iOS widget saves for itself: its last good feed, and the circle + key it was for. */
const IOS_WIDGET_CACHE_KEYS = ['widget.cachedFeed', 'widget.cachedFeedFor'] as const;

export interface IosWidgetSettings {
  key: string;
  circleId: string;
  feedUrl: string;
  apiKey: string;
}

/** Hand the iOS widget its settings (null clears them → it asks you to pick a circle). */
export function writeIosWidgetSettings(settings: IosWidgetSettings | null): void {
  if (Platform.OS !== 'ios') return;
  try {
    const storage = new ExtensionStorage(APP_GROUP);
    for (const [field, storageKey] of Object.entries(IOS_WIDGET_KEYS)) {
      if (settings) storage.set(storageKey, settings[field as keyof IosWidgetSettings]);
      else storage.remove(storageKey);
    }
    // Cleared (no circle, signed out): its saved copy goes too, so none of it can come back.
    if (!settings) for (const cacheKey of IOS_WIDGET_CACHE_KEYS) storage.remove(cacheKey);
    ExtensionStorage.reloadWidget();
  } catch {
    // no widget extension in this build
  }
}

interface AndroidWidgetModule {
  setWidgetData(json: string): void;
  reloadAll(): void;
}

const android =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<AndroidWidgetModule>('InnerCircleWidget')
    : null;

/** Give the Android widget its data (null clears it → it asks you to pick a circle). */
export function writeAndroidWidgetData(data: object | null): void {
  try {
    android?.setWidgetData(JSON.stringify(data ?? {}));
    android?.reloadAll();
  } catch {
    // no widget in this build
  }
}
