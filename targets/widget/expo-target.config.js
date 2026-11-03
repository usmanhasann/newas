/**
 * iOS home-screen widget (client spec 2026-09-29): a Private circle's members' latest moods.
 * Large size only. @bacons/apple-targets adds this WidgetKit extension at prebuild; the Swift sources
 * next to this file are the source of truth. It reads the settings the app writes into the shared
 * App Group (src/features/widget/native.ts) and fetches the circle's feed on its own.
 */
const fs = require('fs');
const path = require('path');
const tokens = require('../../src/theme/tokens.cjs');

/**
 * The lowest iOS the app itself runs on, which Expo sets (the app target, the Podfile and every Expo
 * module share it; ExpoModulesCore.podspec is where it is declared). The widget uses the SAME
 * minimum, so it is in the widget gallery on every iPhone that can install LYSM. A higher minimum
 * hides the widget from the gallery on older iOS while the app still installs (TestFlight build 11:
 * widget 17.0, app 16.4). Read here, not copied, so an Expo upgrade moves both together.
 */
function appMinimumIos() {
  const podspec = path.join(
    path.dirname(require.resolve('expo-modules-core/package.json')),
    'ExpoModulesCore.podspec',
  );
  const match = /:ios\s*=>\s*'(\d+(?:\.\d+)*)'/.exec(fs.readFileSync(podspec, 'utf8'));
  if (!match) {
    throw new Error(`Widget: couldn't read the app's minimum iOS version from ${podspec}`);
  }
  return match[1];
}

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'LYSMWidget',
  displayName: 'LYSM',
  bundleIdentifier: '.widget',
  deploymentTarget: appMinimumIos(),
  frameworks: ['SwiftUI', 'WidgetKit'],
  // Backgrounds for the initial shown when a member has no profile photo (white initial on top).
  colors: {
    AvatarPurple: tokens.colors.brand[500],
    AvatarViolet: tokens.colors.violet,
    AvatarPink: tokens.colors['accent-pink'],
    AvatarAmber: tokens.colors.streak,
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});

module.exports.appMinimumIos = appMinimumIos;
