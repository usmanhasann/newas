/**
 * Client revisions 10/14 p.5 (N7.15): in the in-app banners, a verified person's name has the
 * verified badge right after it ("[Name] ✓ in [Circle name]"); everyone else's banner is unchanged.
 * Screen readers hear "verified" after the name.
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

const C1 = '11111111-1111-4111-8111-111111111111';
const PLAIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const VERIFIED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const ROOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const mockPosts: Record<string, object> = {
  [PLAIN]: {
    parentId: ROOT,
    authorId: 'u-mia',
    authorName: 'Mia',
    authorVerified: false,
    text: 'Same here',
  },
  [VERIFIED]: {
    parentId: null,
    authorId: 'u-taylor',
    authorName: 'Taylor Star',
    authorVerified: true,
    text: 'Morning walk felt great',
  },
};
const mockFetchBannerPost = jest.fn(async (id: string) => ({
  id,
  circleId: C1,
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
const mockNav = {
  isReady: () => true,
  getRootState: () => ({ index: 0, routes: [{ name: 'Main' }] }),
  getCurrentRoute: () => ({ name: 'JournalHome' }),
  addListener: () => () => {},
  navigate: jest.fn(),
};

const arrive = async (id: string, postId: string) => {
  await act(async () => {
    mockListeners.received!({
      request: {
        identifier: id,
        content: {
          title: 'New post',
          body: 'Someone posted.',
          data: { type: 'post_created', circle_id: C1, post_id: postId },
        },
      },
    });
  });
};

it('puts the verified badge right after a verified author’s name, and only theirs', async () => {
  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainerRefContext.Provider value={mockNav as never}>
        <InAppBannerHost />
      </NavigationContainerRefContext.Provider>
    </SafeAreaProvider>,
  );

  // Someone who isn't verified: the exact top line, no badge.
  await arrive('push-1', PLAIN);
  expect(utils.getByText('Mia replied in Konah’s Friends')).toBeTruthy();
  expect(utils.queryByTestId('verified-badge')).toBeNull();
  expect(utils.getByTestId('in-app-banner-press').props.accessibilityLabel).toBe(
    'Mia replied in Konah’s Friends. Same here',
  );

  // It goes after about 4 seconds; then a verified person's post.
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  await arrive('push-2', VERIFIED);

  const badge = utils.getByTestId('verified-badge');
  // The top line: the name, a space, the badge, then the rest of the exact client text.
  const title = utils.getByText(/Taylor Star/);
  const parts = title.children;
  const at = parts.indexOf('Taylor Star');
  expect(at).toBeGreaterThanOrEqual(0);
  expect(parts[at + 1]).toBe(' ');
  expect(typeof parts[at + 2]).not.toBe('string'); // the badge
  expect(parts[at + 3]).toBe(' in Konah’s Friends');
  // That badge is the verified one, inside the top line.
  let node: typeof badge | null = badge;
  while (node && node !== parts[at + 2]) node = node.parent;
  expect(node).toBe(parts[at + 2]);
  expect(utils.getByText('Morning walk felt great')).toBeTruthy();
  expect(utils.getByTestId('in-app-banner-press').props.accessibilityLabel).toBe(
    'Taylor Star, verified, in Konah’s Friends. Morning walk felt great',
  );
});
