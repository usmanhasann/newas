/**
 * Client 10/14 p.7 (N1.10 / N1.11) on the circle page itself: scrolled down reading older posts, new
 * posts must not push what the person is reading down. The page tells its feed to hold new posts
 * while scrolled down, and once the feed says some are waiting, a small "New posts" button shows at
 * the top; tapping it scrolls back up and lets them in. The button belongs to the Feed tab only.
 * The feed itself is mocked here (CircleFeedLiveHold.test covers the holding); this file is about
 * the page around it. One render per file (React 19 leaks across sibling renders).
 */
import { ScrollView } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

type FeedProps = { holdNewPosts?: boolean; onNewPostsWaiting?: (count: number) => void };
const mockFeedProps: FeedProps[] = [];
jest.mock('@features/circles/components/CircleFeed', () => ({
  CircleFeed: (p: FeedProps) => {
    mockFeedProps.push(p);
    return null;
  },
}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Family',
      type: 'private',
      owner_id: 'u1',
      description: null,
      archived_at: null,
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: [
      {
        membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
        profile: { user_id: 'u1', display_name: 'Konah', avatar_url: null, bio: null },
      },
      {
        membership: { id: 'm2', user_id: 'u2', status: 'approved', role: 'member' },
        profile: { user_id: 'u2', display_name: 'Auguste', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

const lastFeed = () => mockFeedProps[mockFeedProps.length - 1]!;
const scrollTo = (y: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 400, height: 3000 },
    layoutMeasurement: { width: 400, height: 800 },
  },
});

it('scrolled down: new posts wait behind “New posts”, which takes the person back up', async () => {
  const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const utils = await render(
    <CircleDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  // At the top: nothing is held and there is no button.
  expect(lastFeed().holdNewPosts).toBe(false);
  expect(utils.queryByLabelText('New posts')).toBeNull();

  // Scrolled down reading older posts: the feed is told to hold new ones.
  await act(async () => {
    fireEvent.scroll(utils.getByTestId('circle-detail-scroll'), scrollTo(900));
  });
  expect(lastFeed().holdNewPosts).toBe(true);
  expect(utils.queryByLabelText('New posts')).toBeNull(); // nothing waiting yet

  // Two new posts come in while reading: the button shows at the top.
  await act(async () => lastFeed().onNewPostsWaiting?.(2));
  expect(utils.getByLabelText('New posts')).toBeTruthy();

  // The button is about the feed: it isn't shown on the Members tab.
  await act(async () => {
    fireEvent.press(utils.getByText('Members (2)'));
  });
  expect(utils.queryByLabelText('New posts')).toBeNull();
  await act(async () => {
    fireEvent.press(utils.getByText('Feed'));
  });
  expect(utils.getByLabelText('New posts')).toBeTruthy();

  // Tapping it scrolls up to the new posts and stops holding them.
  await act(async () => {
    fireEvent.press(utils.getByLabelText('New posts'));
  });
  expect(scrollToSpy).toHaveBeenCalledWith({ y: 0, animated: true });
  expect(lastFeed().holdNewPosts).toBe(false);

  // Back at the top the feed lets them in and reports none waiting: the button goes away.
  await act(async () => lastFeed().onNewPostsWaiting?.(0));
  expect(utils.queryByLabelText('New posts')).toBeNull();

  // The ••• menu still opens over the page (unchanged).
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Circle options'));
  });
  expect(utils.getByRole('menuitem')).toBeTruthy();
});
