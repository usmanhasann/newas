/**
 * Client revisions 10/14 p.8: no banners while the user is in onboarding, on a paywall, on the
 * sign-in or sign-up screens, or while the crisis resources pop-up is open (it holds them). A
 * banner on screen when the pop-up opens goes away.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render } from '@testing-library/react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';
import { useBannerHoldStore } from '@store/bannerHold';

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
const mockRoot = { name: 'Onboarding' };
const mockStateListeners: (() => void)[] = [];
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: mockRoot.name }] }),
  getCurrentRoute: () => ({ name: 'JournalHome' }),
  addListener: (_e: string, cb: () => void) => {
    mockStateListeners.push(cb);
    return () => {};
  },
  navigate: jest.fn(),
};

let n = 0;
const arrive = async (title: string) => {
  n += 1;
  await act(async () => {
    mockListeners.received!({
      request: {
        identifier: `push-${n}`,
        content: { title, body: 'Body', data: { type: 'streak_reminder' } },
      },
    });
  });
};
const goTo = async (name: string) => {
  mockRoot.name = name;
  await act(async () => mockStateListeners.forEach((cb) => cb()));
};

it('shows no banner outside the app’s main screens or while the crisis pop-up is open', async () => {
  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );

  // Onboarding (sign-up lives inside it), the paywall, sign-in.
  await arrive('During onboarding');
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  await goTo('Paywall');
  await arrive('On the paywall');
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  await goTo('Auth');
  await arrive('On sign in');
  expect(utils.queryByTestId('in-app-banner')).toBeNull();

  // In the app: banners show, and nothing that came in earlier pops up late.
  await goTo('Main');
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  await arrive('In the app');
  expect(utils.getByText('In the app')).toBeTruthy();

  // The crisis resources pop-up opens: the banner goes and none show while it's open.
  let release: () => void = () => {};
  await act(async () => {
    release = useBannerHoldStore.getState().hold();
  });
  expect(utils.queryByText('In the app')).toBeNull();
  await arrive('While the crisis pop-up is open');
  expect(utils.queryByTestId('in-app-banner')).toBeNull();

  // Closed again: the next one shows.
  await act(async () => release());
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  await arrive('After the pop-up');
  expect(utils.getByText('After the pop-up')).toBeTruthy();
});
