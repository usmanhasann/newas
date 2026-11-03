/**
 * Client revisions 10/14 p.8: a reply that arrives while the app is open shows as an in-app banner,
 * top line "[Name] replied in [Circle name]", second line a one line preview of what they wrote.
 * Tapping it opens the circle and goes to the post, aimed at that reply.
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

const mockFetchBannerPost = jest.fn();
const mockFetchPostParent = jest.fn();
jest.mock('@features/notifications/api', () => ({
  fetchBannerPost: (id: string) => mockFetchBannerPost(id),
  fetchPostParent: (id: string) => mockFetchPostParent(id),
}));

const C1 = '11111111-1111-4111-8111-111111111111';
const ROOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REPLY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockNavigate = jest.fn();
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: 'Main' }] }),
  getCurrentRoute: () => ({ name: 'JournalHome' }),
  addListener: () => () => {},
  navigate: mockNavigate,
};

it('shows a reply banner with the exact top line and a one line preview, and opens the reply', async () => {
  mockFetchBannerPost.mockResolvedValue({
    id: REPLY,
    circleId: C1,
    parentId: ROOT,
    authorId: 'u-auguste',
    authorName: 'Auguste',
    avatarUrl: null,
    circleName: 'Konah’s Friends',
    text: 'Same here!\n\nIt was a long week',
  });

  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );
  expect(utils.queryByTestId('in-app-banner')).toBeNull();

  await act(async () => {
    mockListeners.received!({
      request: {
        identifier: 'push-1',
        content: {
          title: 'New reply',
          body: 'Auguste replied to your post.',
          data: { type: 'post_created', circle_id: C1, post_id: REPLY },
        },
      },
    });
  });

  await waitFor(() => expect(utils.getByText('Auguste replied in Konah’s Friends')).toBeTruthy());
  expect(mockFetchBannerPost).toHaveBeenCalledWith(REPLY);
  const preview = utils.getByText('Same here! It was a long week');
  expect(preview.props.numberOfLines).toBe(1);

  await fireEvent.press(utils.getByTestId('in-app-banner-press'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  expect(mockNavigate).toHaveBeenCalledWith('Main', {
    screen: 'CirclesTab',
    params: {
      state: {
        routes: [
          { name: 'MyCircles' },
          { name: 'CircleDetail', params: { circleId: C1 } },
          { name: 'PostThread', params: { circleId: C1, postId: ROOT, replyToId: REPLY } },
        ],
      },
    },
  });
  // Its parent was already known: no second lookup.
  expect(mockFetchPostParent).not.toHaveBeenCalled();
});
