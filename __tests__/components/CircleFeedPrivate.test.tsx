/**
 * A PRIVATE circle's one feed (Board and Posts merged, client spec 2026-09-29): the 10 newest
 * posts and shared entries together, each with its replies collapsed under "View N replies", an
 * arrow to the full list, and a composer (with its "Mood" button) for new posts. A reply to a reply
 * shows under that reply, with its own "View N replies", like Public (client 10/14 p.6); Reply on
 * it opens the POST's page aimed at it.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { CircleFeed } from '@features/circles/components/CircleFeed';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({
  fetchMyCircleStanding: jest.fn(),
  reportContent: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }), // moderation standing
}));

const post = (over: Record<string, unknown>) => ({
  circle_id: 'c1',
  parent_id: null,
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
  thread_created_at: '2026-09-29T09:00:00Z',
  mention: null,
  liked_by_me: false,
  ...over,
});

const mockPreview = jest.fn();
const mockCreate = jest.fn((_i: unknown) => Promise.resolve({ id: 'new' }));
jest.mock('@features/circles/postsHooks', () => ({
  useFeedPreview: (...args: unknown[]) => {
    mockPreview(...args);
    return {
      isLoading: false,
      data: {
        items: [
          post({
            id: 'p1',
            author_id: 'u1',
            body: 'I slowed down today.',
            entry_id: 'e1',
            entry_version: 'reflection',
            mood_slugs: ['calm'],
            reply_count: 2,
            author: { user_id: 'u1', display_name: 'Konah', avatar_url: null },
          }),
          post({
            id: 'p2',
            author_id: 'u3',
            body: 'Walk at 5?',
            author: { user_id: 'u3', display_name: 'Augie', avatar_url: null },
          }),
        ],
        nextCursor: null,
      },
    };
  },
  useReplies: (parentId: string, enabled: boolean) => ({
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
          items:
      enabled && parentId === 'p1'
        ? [
            post({ id: 'r1', parent_id: 'p1', author_id: 'u3', body: 'Love this', reply_count: 1, author: { user_id: 'u3', display_name: 'Augie', avatar_url: null } }),
            // From before 10/14: a reply to a reply was kept under the post, tagged "@".
            post({ id: 'r2', parent_id: 'p1', author_id: 'u2', body: 'Same here', mention_user_id: 'u3', mention: { user_id: 'u3', display_name: 'Augie', avatar_url: null }, author: { user_id: 'u2', display_name: 'Bea', avatar_url: null } }),
          ]
        : enabled && parentId === 'r1'
          ? [post({ id: 'r9', parent_id: 'r1', author_id: 'u4', body: 'Me three', author: { user_id: 'u4', display_name: 'Cy', avatar_url: null } })]
          : [],
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

it('shows posts + shared entries, collapsed replies, the arrow, and posts with a mood', async () => {
  const onOpenThread = jest.fn();
  const onSeeAll = jest.fn();
  const utils = await render(
    <CircleFeed
      circle={{ id: 'c1', name: 'Family', type: 'private', owner_id: 'u1', archived_at: null } as never}
      isMember
      onOpenThread={onOpenThread}
      onSeeAll={onSeeAll}
    />,
  );

  // Preview: the 10 newest of everyone's posts and shared entries.
  expect(mockPreview).toHaveBeenCalledWith('c1', 10, null);
  expect(utils.getByText('I slowed down today.')).toBeTruthy();
  expect(utils.getByLabelText('Shared as an AI reflection')).toBeTruthy();
  expect(utils.getByText('Walk at 5?')).toBeTruthy();

  // Replies stay collapsed until asked for; an older reply to a reply (kept under the post) shows
  // its "@".
  expect(utils.queryByText('Love this')).toBeNull();
  await act(async () => {
    fireEvent.press(utils.getByText('View 2 replies'));
  });
  expect(utils.getByText('Love this')).toBeTruthy();
  expect(utils.getByText('@Augie')).toBeTruthy();

  // A reply to Augie's reply shows UNDER Augie's reply, behind its own "View 1 reply".
  expect(utils.queryByText('Me three')).toBeNull();
  await act(async () => {
    fireEvent.press(utils.getByText('View 1 reply'));
  });
  expect(utils.getByText('Me three')).toBeTruthy();
  // Reply on it opens the POST's page aimed at it (not Augie's reply's own page).
  await act(async () => {
    fireEvent.press(utils.getAllByText('Reply')[2]!);
  });
  expect(onOpenThread).toHaveBeenLastCalledWith('p1', 'r9');

  // Replying happens on the post's own page.
  fireEvent.press(utils.getAllByText('Reply')[0]!);
  expect(onOpenThread).toHaveBeenLastCalledWith('p1');
  // Reply on a REPLY opens its post's page already aimed at that reply (audit 2026-09-30: it
  // opened the reply's own page, where the answer never showed).
  fireEvent.press(utils.getAllByText('Reply')[1]!);
  expect(onOpenThread).toHaveBeenLastCalledWith('p1', 'r1');

  // The arrow opens the full list.
  fireEvent.press(utils.getByLabelText('See all posts'));
  expect(onSeeAll).toHaveBeenCalledTimes(1);

  // Posting from the feed (the Mood button itself is covered in ComposerMood.test).
  expect(utils.getByLabelText('Add a mood')).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Share with your circle…'), 'Rough morning');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Post'));
  });
  expect(mockCreate).toHaveBeenCalledWith({ parentId: null, body: 'Rough morning', moodSlugs: [] });
});
