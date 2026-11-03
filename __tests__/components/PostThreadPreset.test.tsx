/**
 * Reply on a reply in a circle's feed opens the POST's page already answering that reply
 * (audit 2026-09-30): it used to open the reply's own page. The answer shows under that reply on the
 * post's page (client 10/14 p.6). Sending answers the reply, then it goes back to the post.
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
      reply_count: 2,
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
            item({ id: 'r1', parent_id: 'p1', author_id: 'u3', body: 'I’m in!', author: { user_id: 'u3', display_name: 'Augie', avatar_url: null } }),
            item({ id: 'r2', parent_id: 'p1', author_id: 'u4', body: 'Me too', author: { user_id: 'u4', display_name: 'Bea', avatar_url: null } }),
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

it('opens aimed at the reply from the feed, answers it, then goes back to the post', async () => {
  const utils = await render(
    <PostThreadScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { circleId: 'c1', postId: 'p1', replyToId: 'r2' } } as never}
    />,
  );
  expect(utils.getByText('Replying to @Bea')).toBeTruthy();

  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'See you both');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'r2', body: 'See you both', moodSlugs: [] });
  // Done with the preset: the next reply goes to the post unless another reply is picked.
  expect(utils.queryByText(/Replying to/)).toBeNull();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Great');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'p1', body: 'Great', moodSlugs: [] });
});
