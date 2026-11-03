/**
 * Terms / Privacy Policy links (sign-up legal line, client 10/14 p.32): open in the in-app browser
 * so the person keeps their place, and fall back to the system browser if that can't open.
 */
import { Linking } from 'react-native';
import { openLegalPage, PRIVACY_POLICY_URL } from '@lib/legal';

const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

it('opens in the in-app browser; falls back to the system browser when that fails', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  mockOpenBrowser.mockResolvedValueOnce({ type: 'dismiss' });
  await openLegalPage(PRIVACY_POLICY_URL);
  expect(mockOpenBrowser).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  expect(openURL).not.toHaveBeenCalled();

  mockOpenBrowser.mockRejectedValueOnce(new Error('no browser'));
  await openLegalPage(PRIVACY_POLICY_URL);
  expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);

  // A failing system browser is swallowed (a tap on a link never throws).
  mockOpenBrowser.mockRejectedValueOnce(new Error('no browser'));
  openURL.mockRejectedValueOnce(new Error('no handler'));
  await expect(openLegalPage(PRIVACY_POLICY_URL)).resolves.toBeUndefined();
});
