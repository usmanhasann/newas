/**
 * Client 10/14 p.6: in a PRIVATE circle, a reply to someone's reply must work like Public: it is
 * attached to that reply and shows under it. The post's page now shows each reply with its own
 * replies under "View N replies" (it used to list Private replies flat), Reply on someone's reply
 * answers THAT reply, and arriving aimed at a reply deeper in the thread (from the feed) answers
 * that one too instead of falling back to the post.
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
const mockRoot = item({
  id: 'p1',
  parent_id: null,
  author_id: 'u2',
  body: 'Rough week',
  reply_count: 2,
  author: { user_id: 'u2', display_name: 'Konah', avatar_url: null },
});
const mockAugie = item({
  id: 'r1',
  parent_id: 'p1',
  author_id: 'u3',
  body: 'I’m here for you',
  reply_count: 1,
  author: { user_id: 'u3', display_name: 'Augie', avatar_url: null },
});
// A reply to Augie's reply: deeper than the post's own replies.
const mockBea = item({
  id: 'r9',
  parent_id: 'r1',
  author_id: 'u4',
  body: 'Same here',
  author: { user_id: 'u4', display_name: 'Bea', avatar_url: null },
});
const mockUsePost = jest.fn((id: string) => ({
  isLoading: false,
  data: id === 'p1' ? mockRoot : id === 'r9' ? mockBea : undefined,
}));
const mockCreate = jest.fn((_i: unknown) => Promise.resolve({ id: 'new', parent_id: 'r9', circle_id: 'c1' }));
jest.mock('@features/circles/postsHooks', () => ({
  usePost: (id: string) => mockUsePost(id),
  useReplies: (parentId: string) => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    isFetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    data: { pages: [{ nextCursor: null, items: parentId === 'p1' ? [mockAugie] : [] }] },
  }),
  replyItems: (q: { data?: { pages: { items: unknown[] }[] } }) =>
    q.data?.pages.flatMap((p) => p.items) ?? [],
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useCreatePost: () => ({ mutateAsync: mockCreate, isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
  useDeletePost: () => ({ mutate: jest.fn() }),
}));

it('Private: replies are grouped under the reply they answer, and Reply answers that reply', async () => {
  const utils = await render(
    <PostThreadScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { circleId: 'c1', postId: 'p1', replyToId: 'r9' } } as never}
    />,
  );
  // Augie's reply heads its own group, its reply collapsed under it (as in Public).
  expect(utils.getByText('View 1 reply')).toBeTruthy();
  // The deeper reply this page was opened for is loaded and answered.
  expect(mockUsePost).toHaveBeenCalledWith('r9');
  expect(utils.getByText('Replying to @Bea')).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Thank you both');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'r9', body: 'Thank you both', moodSlugs: [] });

  // Reply on Augie's reply: the answer goes to Augie's reply, not to the post.
  const replyButtons = utils.getAllByText('Reply');
  await act(async () => {
    fireEvent.press(replyButtons[1]!); // [0] is the post's own Reply
  });
  expect(utils.getByText('Replying to @Augie')).toBeTruthy();
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Means a lot');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'r1', body: 'Means a lot', moodSlugs: [] });
});
