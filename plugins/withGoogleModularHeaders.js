const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * GoogleSignIn (pulled in by @react-native-google-signin/google-signin) drags in `AppCheckCore`,
 * a Swift pod that depends on `GoogleUtilities` and `RecaptchaInterop`. Those two pods don't
 * define modules, so when everything is integrated as STATIC libraries (the Expo default) Swift
 * can't import them → `pod install` fails on iOS with:
 *   "[!] The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
 *        which do not define modules ... cannot yet be integrated as static libraries"
 *
 * Fixing it exactly as CocoaPods recommends: force `:modular_headers => true` on those two pods
 * so they generate module maps. Targeted (doesn't touch other pods, unlike a global
 * `use_modular_headers!`). The managed Podfile is generated at prebuild, so we patch it here.
 */
const PODS = ['GoogleUtilities', 'RecaptchaInterop'];

module.exports = function withGoogleModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes(':modular_headers => true')) {
        const lines = PODS.map((p) => `  pod '${p}', :modular_headers => true`).join('\n');
        // Insert the declarations just inside the first app target block.
        contents = contents.replace(/(target ['"][^'"]+['"] do)/, `$1\n${lines}`);
        fs.writeFileSync(podfile, contents, 'utf8');
      }
      return cfg;
    },
  ]);
};
