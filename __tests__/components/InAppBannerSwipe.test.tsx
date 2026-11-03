/**
 * Client revisions 10/14 p.7: the user can swipe a banner up to dismiss it (a small drag springs
 * back; a swipe never opens anything). Uses the daily journaling reminder, scheduled on the phone,
 * which shows as a banner while the app is open instead of a system notification.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render } from '@testing-library/react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';

jest.useFakeTimers();

const mockListeners: { received?: (n: unknown) => void } = {};
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (cb: (n: unknown) => void) => {
    mockListeners.received = cb;
    return { remove: () => {} };
  },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
jest.mock('@features/notifications/api', () => ({
  fetchBannerPost: jest.fn(),
  fetchPostParent: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const mockNavigate = jest.fn();
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: 'Main' }] }),
  getCurrentRoute: () => ({ name: 'ProfileHome' }),
  addListener: () => () => {},
  navigate: mockNavigate,
};

const touch = (pageY: number, timestamp: number) => ({
  nativeEvent: { pageX: 120, pageY, timestamp },
});

it('springs back from a small drag and goes away on a swipe up, opening nothing', async () => {
  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );

  await act(async () => {
    mockListeners.received!({
      request: {
        identifier: 'ic-daily-checkin-2026-10-20',
        content: { title: 'Your daily check-in', body: 'What made you smile today?', data: {} },
      },
    });
  });
  const banner = utils.getByTestId('in-app-banner');
  expect(utils.getByText('Your daily check-in')).toBeTruthy();

  // A small drag: it stays.
  await fireEvent(banner, 'touchStart', touch(100, 1000));
  await fireEvent(banner, 'responderGrant', touch(100, 1000));
  await fireEvent(banner, 'responderMove', touch(95, 1100));
  await fireEvent(banner, 'responderRelease', touch(95, 1100));
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(utils.queryByTestId('in-app-banner')).not.toBeNull();

  // A swipe up: it goes.
  await fireEvent(utils.getByTestId('in-app-banner'), 'touchStart', touch(100, 2000));
  await fireEvent(utils.getByTestId('in-app-banner'), 'responderGrant', touch(100, 2000));
  await fireEvent(utils.getByTestId('in-app-banner'), 'responderMove', touch(70, 2040));
  await fireEvent(utils.getByTestId('in-app-banner'), 'responderMove', touch(40, 2080));
  await fireEvent(utils.getByTestId('in-app-banner'), 'responderRelease', touch(40, 2080));
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  expect(mockNavigate).not.toHaveBeenCalled();
});
