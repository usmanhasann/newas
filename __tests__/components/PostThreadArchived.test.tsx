/**
 * Client revisions 10/14 p.23 (N3): in an archived circle no one can reply. A post's page there has
 * no reply box; in its place is the same label the top of the circle shows, "This circle has been
 * archived." Everything stays readable and hearts still work.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, within } from '@testing-library/react-native';
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
    data: {
      id: 'c1',
      name: 'Family',
      type: 'private',
      owner_id: 'u1',
      archived_at: '2026-10-20T09:00:00Z',
    },
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
const mockHeart = jest.fn();
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
  useCreatePost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: (a: unknown) => mockHeart(a) }),
  useDeletePost: () => ({ mutate: jest.fn() }),
}));

it('archived: the label takes the reply box’s place; the post and replies stay, hearts still work', async () => {
  const utils = await render(
    <PostThreadScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { circleId: 'c1', postId: 'p1' } } as never}
    />,
  );

  // Readable as before.
  expect(utils.getByText('Walk at 5?')).toBeTruthy();
  expect(utils.getByText('I’m in!')).toBeTruthy();

  // No reply box and no Reply buttons; the label is where the box was, below the replies.
  expect(utils.queryByPlaceholderText('Write a reply…')).toBeNull();
  expect(utils.queryByText('Send')).toBeNull();
  expect(utils.queryByText('Reply')).toBeNull();
  const label = utils.getByTestId('circle-archived-label');
  expect(within(label).getByText('This circle has been archived.')).toBeTruthy();
  const tree = JSON.stringify(utils.toJSON());
  expect(tree.indexOf('I’m in!')).toBeLessThan(tree.indexOf('This circle has been archived.'));

  // Hearts still work in an archived circle.
  await act(async () => {
    fireEvent.press(utils.getAllByLabelText('Like')[0]!);
  });
  expect(mockHeart).toHaveBeenCalledWith({ postId: 'p1', on: true });
});
