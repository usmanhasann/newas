/**
 * Client 10/14 p.6 on a Private circle's full list ("See all"): a reply to a reply shows under that
 * reply, and Reply on it opens the POST's page aimed at it (never the reply's own page).
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { CircleFeedScreen } from '@features/circles/screens/CircleFeedScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/moderation', () => ({ fetchMyCircleStanding: jest.fn(), reportContent: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }),
}));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: { id: 'c1', name: 'Family', type: 'private', owner_id: 'u1', archived_at: null },
    isLoading: false,
  }),
  useMyCircles: () => ({ data: [{ id: 'c1' }] }),
}));
jest.mock('@features/circles/postMenu', () => ({ usePostMenu: () => jest.fn() }));

const mockPost = (over: Record<string, unknown>) => ({
  circle_id: 'c1',
  reply_count: 0,
  like_count: 0,
  created_at: '2026-09-29T09:00:00Z',
  deleted_at: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  mention: null,
  liked_by_me: false,
  ...over,
});
const mockPage = (items: unknown[]) => ({
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  isError: false,
  isFetching: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
  data: { pages: [{ nextCursor: null, items }] },
});
jest.mock('@features/circles/postsHooks', () => ({
  useCircleFeed: () =>
    mockPage([
      mockPost({ id: 'p1', parent_id: null, author_id: 'u2', body: 'Rough week', reply_count: 2, author: { user_id: 'u2', display_name: 'Konah', avatar_url: null } }),
    ]),
  useReplies: (parentId: string, enabled: boolean) =>
    mockPage(
      !enabled
        ? []
        : parentId === 'p1'
          ? [mockPost({ id: 'r1', parent_id: 'p1', author_id: 'u3', body: 'I’m here', reply_count: 1, author: { user_id: 'u3', display_name: 'Augie', avatar_url: null } })]
          : parentId === 'r1'
            ? [mockPost({ id: 'r9', parent_id: 'r1', author_id: 'u4', body: 'Same here', author: { user_id: 'u4', display_name: 'Bea', avatar_url: null } })]
            : [],
    ),
  replyItems: (q: { data?: { pages: { items: unknown[] }[] } }) =>
    q.data?.pages.flatMap((p) => p.items) ?? [],
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
}));

it('Private full list: Reply on a reply to a reply opens the post’s page aimed at it', async () => {
  const navigate = jest.fn();
  const utils = await render(
    <CircleFeedScreen
      navigation={{ navigate, goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );
  await act(async () => {
    fireEvent.press(utils.getByText('View 2 replies'));
  });
  await act(async () => {
    fireEvent.press(utils.getByText('View 1 reply'));
  });
  expect(utils.getByText('Same here')).toBeTruthy();
  const replies = utils.getAllByText('Reply');
  await act(async () => {
    fireEvent.press(replies[replies.length - 1]!);
  });
  expect(navigate).toHaveBeenLastCalledWith('PostThread', { circleId: 'c1', postId: 'p1', replyToId: 'r9' });
  await act(async () => {
    fireEvent.press(replies[1]!);
  });
  expect(navigate).toHaveBeenLastCalledWith('PostThread', { circleId: 'c1', postId: 'p1', replyToId: 'r1' });
});
