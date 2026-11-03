/**
 * A Private post's page: replying to one of its replies targets that reply ("Replying to @Name"),
 * and the answer is kept under that reply, like Public (client 10/14 p.6; only a reply deeper than
 * that joins the group tagged "@"). Cancel goes back to replying to the post itself.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { PostThreadScreen } from '@features/circles/screens/PostThreadScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
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

const item = (over: Record<string, unknown>) => ({
  circle_id: 'c1',
  reply_count: 0,
  like_count: 0,
  created_at: '2026-09-29T09:00:00Z',
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  mention: null,
  thread_created_at: '2026-09-29T09:00:00Z',
  liked_by_me: false,
  ...over,
});
const mockCreate = jest.fn((_i: unknown) => Promise.resolve({ id: 'new', parent_id: 'p1', circle_id: 'c1' }));
jest.mock('@features/circles/postsHooks', () => ({
  usePost: () => ({
    isLoading: false,
    data: item({
      id: 'p1',
      parent_id: null,
      author_id: 'u1',
      body: 'Walk at 5?',
      reply_count: 1,
      author: { user_id: 'u1', display_name: 'Konah', avatar_url: null },
    }),
  }),
  useReplies: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    isFetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    data: {
      pages: [
        {
          nextCursor: null,
          items: [
            item({
              id: 'r1',
              parent_id: 'p1',
              author_id: 'u3',
              body: 'I’m in!',
              author: { user_id: 'u3', display_name: 'Augie', avatar_url: null },
            }),
          ],
        },
      ],
    },
  }),
  replyItems: (q: { data?: { pages: { items: unknown[] }[] } }) =>
    q.data?.pages.flatMap((p) => p.items) ?? [],
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useCreatePost: () => ({ mutateAsync: mockCreate, isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
  useDeletePost: () => ({ mutate: jest.fn() }),
}));

it('replies to the post by default, or to a tapped reply (@Name), with Cancel to go back', async () => {
  const utils = await render(
    <PostThreadScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { circleId: 'c1', postId: 'p1' } } as never}
    />,
  );
  expect(utils.getByText('Walk at 5?')).toBeTruthy();
  expect(utils.getByText('I’m in!')).toBeTruthy();
  expect(utils.queryByText(/Replying to/)).toBeNull();

  // Tap "Reply" on Augie's reply (the 2nd Reply on the page: the post's, then Augie's).
  await act(async () => {
    fireEvent.press(utils.getAllByText('Reply')[1]!);
  });
  expect(utils.getByText('Replying to @Augie')).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'See you there');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'r1', body: 'See you there', moodSlugs: [] });
  expect(utils.queryByText(/Replying to/)).toBeNull(); // back to the post after sending

  // Cancel returns to replying to the post itself.
  await act(async () => {
    fireEvent.press(utils.getAllByText('Reply')[1]!);
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Cancel'));
  });
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Count me in');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'p1', body: 'Count me in', moodSlugs: [] });
});
