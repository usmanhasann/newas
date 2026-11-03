/**
 * Client revisions 10/14 p.7 and 9: the streak reminder that arrives at 8 PM while the user is in
 * the app shows as an in-app banner (not a push), and the banner disappears on its own after about
 * 4 seconds.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render } from '@testing-library/react-native';
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
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: 'Main' }] }),
  getCurrentRoute: () => ({ name: 'NewEntry' }),
  addListener: () => () => {},
  navigate: jest.fn(),
};

it('shows the streak reminder as a banner, then hides it after about 4 seconds', async () => {
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
        identifier: 'streak-1',
        content: {
          title: 'Don’t lose your streak',
          body: 'Keep your 6 day streak going and journal before midnight.',
          data: { type: 'streak_reminder' },
        },
      },
    });
  });
  expect(utils.getByText('Don’t lose your streak')).toBeTruthy();
  expect(utils.getByText('Keep your 6 day streak going and journal before midnight.')).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(3800);
  });
  expect(utils.queryByTestId('in-app-banner')).not.toBeNull();

  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  expect(utils.queryByText('Don’t lose your streak')).toBeNull();
});
