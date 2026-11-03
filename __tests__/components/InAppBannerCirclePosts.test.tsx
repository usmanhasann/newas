/**
 * Client revisions 10/14 p.8, circle activity banners:
 *  - no banner for activity in the circle the user is looking at (it appears live there);
 *  - a post shows "[Name] in [Circle name]" with a one line preview;
 *  - several posts at once combine into one banner, "Auguste and 2 others posted in Konah’s
 *    Friends.", and tapping it opens that circle.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';

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

const VIEWED = '11111111-1111-4111-8111-111111111111';
const KONAH = '22222222-2222-4222-8222-222222222222';
const mockPosts: Record<string, object> = {
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1': {
    authorId: 'u-mia',
    authorName: 'Mia',
    text: 'Anyone up for a walk?',
  },
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2': {
    authorId: 'u-noor',
    authorName: 'Noor',
    text: 'Coffee later',
  },
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3': {
    authorId: 'u-auguste',
    authorName: 'Auguste',
    text: 'Count me in',
  },
};
const mockFetchBannerPost = jest.fn(async (id: string) => ({
  id,
  circleId: '22222222-2222-4222-8222-222222222222',
  parentId: null,
  avatarUrl: null,
  circleName: 'Konah’s Friends',
  ...mockPosts[id],
}));
jest.mock('@features/notifications/api', () => ({
  fetchBannerPost: (id: string) => mockFetchBannerPost(id),
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
  // The user is looking at another circle's page.
  getCurrentRoute: () => ({ name: 'CircleDetail', params: { circleId: VIEWED } }),
  addListener: () => () => {},
  navigate: mockNavigate,
};

const arrive = async (identifier: string, data: object) => {
  await act(async () => {
    mockListeners.received!({
      request: { identifier, content: { title: 'New post', body: 'Someone posted.', data } },
    });
  });
};

it('skips the circle being viewed, then combines posts that come in at once', async () => {
  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );

  // Activity in the circle on screen: no banner (it shows up live), not even looked up.
  await arrive('v1', {
    type: 'post_created',
    circle_id: VIEWED,
    post_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  });
  await arrive('v2', {
    type: 'post_reaction',
    circle_id: VIEWED,
    post_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  });
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  expect(mockFetchBannerPost).not.toHaveBeenCalled();

  // A post in another circle: "[Name] in [Circle name]" and a preview.
  await arrive('k1', {
    type: 'post_created',
    circle_id: KONAH,
    post_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  });
  await waitFor(() => expect(utils.getByText('Mia in Konah’s Friends')).toBeTruthy());
  expect(utils.getByText('Anyone up for a walk?')).toBeTruthy();

  // Two more people post there at once: one banner for all of them.
  await arrive('k2', {
    type: 'post_created',
    circle_id: KONAH,
    post_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  });
  await arrive('k3', {
    type: 'post_created',
    circle_id: KONAH,
    post_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  });
  await waitFor(() =>
    expect(utils.getByText('Auguste and 2 others posted in Konah’s Friends.')).toBeTruthy(),
  );
  expect(utils.getAllByTestId('in-app-banner')).toHaveLength(1);
  expect(utils.queryByText('Mia in Konah’s Friends')).toBeNull();

  await fireEvent.press(utils.getByTestId('in-app-banner-press'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'CirclesTab',
    params: {
      state: {
        routes: [{ name: 'MyCircles' }, { name: 'CircleDetail', params: { circleId: KONAH } }],
      },
    },
  });
});
