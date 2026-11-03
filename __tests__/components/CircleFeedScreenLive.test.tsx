/**
 * Client 10/14 p.7 (N1) on a Private circle's full list: a new post from someone else appears on
 * its own at the top while the person is at the top. Scrolled down reading older posts, a new post
 * does NOT move the list: a small "New posts" button shows at the top and tapping it takes them up
 * to it. Hearts and deletions update in place meanwhile. Real React Query cache; the Realtime
 * channel and the database are mocked.
 * One render per file (React 19 leaks across sibling renders).
 */
import { FlatList } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { queryClient } from '@lib';
import { CircleFeedScreen } from '@features/circles/screens/CircleFeedScreen';
import type { LivePostSignal, LiveStatus } from '@features/circles/liveApi';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/moderation', () => ({
  fetchMyCircleStanding: () => Promise.resolve('ok'),
  reportContent: jest.fn(),
}));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: { id: 'c1', name: 'Family', type: 'private', owner_id: 'u1', archived_at: null },
    isLoading: false,
  }),
  useMyCircles: () => ({ data: [{ id: 'c1' }] }),
}));
jest.mock('@features/circles/postMenu', () => ({ usePostMenu: () => jest.fn() }));

type Handlers = { onSignal: (s: LivePostSignal) => void; onStatus: (s: LiveStatus) => void };
const mockChannels: { circleId: string; handlers: Handlers }[] = [];
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: (circleId: string, handlers: Handlers) => {
    mockChannels.push({ circleId, handlers });
    return () => Promise.resolve();
  },
}));

const mockId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mockPost = (n: number, minute: number, body: string, over: Record<string, unknown> = {}) => ({
  id: mockId(n),
  circle_id: 'c1',
  author_id: 'u3',
  parent_id: null,
  body,
  reply_count: 0,
  like_count: 0,
  created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00+00:00`,
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  thread_created_at: `2026-10-20T10:${String(minute).padStart(2, '0')}:00+00:00`,
  author: { user_id: 'u3', display_name: 'Auguste', avatar_url: null },
  mention: null,
  liked_by_me: false,
  ...over,
});
const mockFetchFeedPage = jest.fn((..._a: unknown[]) =>
  Promise.resolve({
    items: [mockPost(2, 2, 'Older news'), mockPost(1, 1, 'Oldest news')],
    nextCursor: null,
  }),
);
const mockFetchPost = jest.fn((postId: string) =>
  Promise.resolve(
    postId === mockId(3)
      ? mockPost(3, 3, 'Fresh at the top')
      : postId === mockId(4)
        ? mockPost(4, 4, 'Fresh while reading')
        : null,
  ),
);
jest.mock('@features/circles/postsApi', () => ({
  ...jest.requireActual('@features/circles/postsApi'),
  fetchFeedPage: (...a: unknown[]) => mockFetchFeedPage(...a),
  fetchPost: (id: string) => mockFetchPost(id),
  fetchReplies: () => Promise.resolve({ items: [], nextCursor: null }),
}));

const signal = (over: Partial<LivePostSignal>): LivePostSignal => ({
  op: 'insert',
  post_id: mockId(3),
  parent_id: null,
  like_count: 0,
  reply_count: 0,
  edited: false,
  ...over,
});
const scrollTo = (y: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 400, height: 3000 },
    layoutMeasurement: { width: 400, height: 800 },
  },
});

it('new posts appear on their own at the top, and wait behind “New posts” while reading further down', async () => {
  const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
  const utils = await render(
    <QueryClientProvider client={queryClient}>
      <CircleFeedScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
        route={{ params: { circleId: 'c1' } } as never}
      />
    </QueryClientProvider>,
  );
  await utils.findByText('Older news');
  await waitFor(() => expect(mockChannels).toHaveLength(1));
  expect(mockChannels[0]!.circleId).toBe('c1');
  const { onSignal } = mockChannels[0]!.handlers;

  // At the top: Auguste's new post shows up by itself (only that post is loaded, not the list).
  const feedLoads = mockFetchFeedPage.mock.calls.length;
  await act(async () => onSignal(signal({ post_id: mockId(3) })));
  await utils.findByText('Fresh at the top');
  expect(utils.queryByText('New posts')).toBeNull();
  expect(mockFetchFeedPage).toHaveBeenCalledTimes(feedLoads);

  // Scrolled down reading: the next one waits, the list doesn't move, the button shows.
  await act(async () => {
    fireEvent.scroll(utils.getByTestId('circle-feed-list'), scrollTo(900));
  });
  await act(async () => onSignal(signal({ post_id: mockId(4) })));
  await utils.findByText('New posts');
  expect(utils.queryByText('Fresh while reading')).toBeNull();
  expect(utils.getByText('Fresh at the top')).toBeTruthy();

  // Hearts and deletions still update in place meanwhile.
  await act(async () => {
    onSignal(signal({ op: 'update', post_id: mockId(2), like_count: 3 }));
    onSignal(signal({ op: 'delete', post_id: mockId(1) }));
  });
  await utils.findByText('3');
  await waitFor(() => expect(utils.queryByText('Oldest news')).toBeNull());
  expect(utils.queryByText('Fresh while reading')).toBeNull();

  // Tapping the button goes up to the new post.
  await act(async () => {
    fireEvent.press(utils.getByText('New posts'));
  });
  expect(utils.getByText('Fresh while reading')).toBeTruthy();
  expect(utils.queryByText('New posts')).toBeNull();
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
});
