/**
 * LYSM's legal pages, opened from the sign-up screen ("By continuing, you agree to our Terms and
 * Privacy Policy.", client 10/14 p.32) and anywhere else the app links to them (the paywall's
 * "Terms · Privacy").
 *
 * - Privacy Policy: the page on the LYSM website.
 * - Terms: lysm.app has no Terms page yet, so this is Apple's Standard License Agreement (the
 *   terms that apply to an App Store app that doesn't provide its own). Once LYSM publishes its own
 *   Terms page, change TERMS_URL to it (one line).
 */
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export const PRIVACY_POLICY_URL = 'https://lysm.app/privacy-policy';
export const TERMS_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/**
 * Opens a legal page in the in-app browser, so the person stays on the screen they were on (the
 * sign-up step keeps their place). Falls back to the system browser if the in-app one can't open.
 */
export async function openLegalPage(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}
