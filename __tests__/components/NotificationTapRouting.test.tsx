/**
 * Tapping a push notification from outside the app opens what it is about (client revisions 10/14
 * p.9: a reflection opens it on the Insights tab, a join opens the circle's Members tab). A push that
 * opened the app waits until the user is in the app's main screens, opens once, and is cleared so
 * it never opens again; only a plain tap counts.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';

const mockTap = (identifier: string, data: object, actionIdentifier = 'default') => ({
  actionIdentifier,
  notification: { request: { identifier, content: { title: 't', body: 'b', data } } },
});
const mockState: { response?: (r: unknown) => void; cleared: number } = { cleared: 0 };
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: (cb: (r: unknown) => void) => {
    mockState.response = cb;
    return { remove: () => {} };
  },
  // The app was opened by tapping the reflection push.
  getLastNotificationResponse: () =>
    mockTap('recap-push', {
      type: 'recap',
      recap_type: 'monthly',
      recap_types: 'monthly',
      period_start: '2026-09-01',
    }),
  clearLastNotificationResponse: () => {
    mockState.cleared += 1;
  },
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));
jest.mock('@features/notifications/api', () => ({
  fetchBannerPost: jest.fn(),
  fetchPostParent: jest.fn(),
}));

const C1 = '11111111-1111-4111-8111-111111111111';
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const mockRoot = { name: 'Splash' };
const mockStateListeners: (() => void)[] = [];
const mockNavigate = jest.fn();
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: mockRoot.name }] }),
  getCurrentRoute: () => ({ name: 'JournalHome' }),
  addListener: (_e: string, cb: () => void) => {
    mockStateListeners.push(cb);
    return () => {};
  },
  navigate: mockNavigate,
};

it('opens a tapped push once the app is ready, once, and only for a plain tap', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );

  // Still on the launch screen: it waits.
  expect(mockNavigate).not.toHaveBeenCalled();

  mockRoot.name = 'Main';
  await act(async () => mockStateListeners.forEach((cb) => cb()));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'InsightsTab',
    params: { period: 'month', periodStart: '2026-09-01' },
  });
  expect(mockState.cleared).toBe(1);

  // The same tap reported again opens nothing more; neither does a non-default action.
  await act(async () => {
    mockState.response!(mockTap('recap-push', { type: 'recap', recap_type: 'monthly' }));
    mockState.response!(mockTap('other', { type: 'streak_reminder' }, 'snooze'));
  });
  expect(mockNavigate).toHaveBeenCalledTimes(1);

  // A later tap on a "new members" push opens the circle's Members tab.
  await act(async () => {
    mockState.response!(
      mockTap('join-push', { type: 'member_joined', circle_id: C1, tab: 'members' }),
    );
  });
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(2));
  expect(mockNavigate).toHaveBeenLastCalledWith('Main', {
    screen: 'CirclesTab',
    params: {
      state: {
        routes: [
          { name: 'MyCircles' },
          { name: 'CircleDetail', params: { circleId: C1, tab: 'members' } },
        ],
      },
    },
  });
});
