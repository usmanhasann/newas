/**
 * Client revisions 10/14 p.9: a user in the app at 9 AM (writing an entry, say) gets the
 * reflection notification as an in-app banner, not a push. Several ready the same day come as one
 * ("Your weekly and monthly reflections are ready."). Tapping it opens Insights on that reflection:
 * the view and the exact period the notification announced.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';
import {
  recapPushCopyFor,
  recapPushData,
} from '../../supabase/functions/_shared/recapPush';

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
  getCurrentRoute: () => ({ name: 'NewEntry' }),
  addListener: () => () => {},
  navigate: mockNavigate,
};

it('shows the combined reflection notification as a banner and opens Insights on it', async () => {
  const claims = [
    { user_id: 'u1', type: 'monthly' as const, period_start: '2026-09-01' },
    { user_id: 'u1', type: 'weekly' as const, period_start: '2026-09-24' },
  ];
  // Exactly what recap-notifications sends.
  const copy = recapPushCopyFor(claims.map((c) => c.type));
  const data = recapPushData(claims);

  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    mockListeners.received!({
      request: { identifier: 'recap-1', content: { ...copy, data } },
    });
  });

  expect(utils.getByText('Your weekly and monthly reflections are ready.')).toBeTruthy();
  await fireEvent.press(utils.getByTestId('in-app-banner-press'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'InsightsTab',
    params: { period: 'week', periodStart: '2026-09-24' },
  });
});
