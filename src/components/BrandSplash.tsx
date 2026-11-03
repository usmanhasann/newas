/**
 * Static branded splash that pixel-matches the NATIVE splash — the brand-purple "lysm" wordmark centered
 * on the app background, with NO spinner. Used for the gate's cold-launch 'splash' route (and the
 * navigation-restore fallback) so the native-splash → JS hand-off is seamless: a spinner here
 * would read as a "loader" the native splash never showed, and any cross-fade out of it would
 * flash that loader. Keep in sync with app.config.ts's expo-splash-screen config
 * (image ./assets/splash-logo.png — the brand-purple "lysm" wordmark on transparent bg, imageWidth 200,
 * resizeMode 'contain', backgroundColor background).
 */
import { Image, View } from 'react-native';
import { colors } from '@theme';

const LOGO = require('../../assets/splash-logo.png');

export function BrandSplash() {
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: colors.background }}
    >
      <Image source={LOGO} style={{ width: 200, height: 200 }} resizeMode="contain" />
    </View>
  );
}
