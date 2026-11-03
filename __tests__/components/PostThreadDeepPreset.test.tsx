/**
 * Opened aimed at a reply deeper in the thread (client 10/14 p.6): until that reply has loaded,
 * Send waits (it would otherwise answer the post); a reply that turns out to be in another circle
 * is never answered (the reply goes to the post).
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
// The deeper reply the page was opened for: first still loading, then (here) from ANOTHER circle.
const mockDeep: { isLoading: boolean; data: unknown } = { isLoading: true, data: undefined };
const mockUsePost = jest.fn((id: string) =>
  id === 'p1' ? { isLoading: false, data: mockRoot } : id === 'r9' ? mockDeep : { isLoading: false, data: undefined },
);
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

it('waits for the deeper reply before sending, and never answers one from another circle', async () => {
  const screen = () => (
    <PostThreadScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { circleId: 'c1', postId: 'p1', replyToId: 'r9' } } as never}
    />
  );
  const utils = await render(screen());
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('Write a reply…'), 'Thank you');
  });
  // Still loading: Send is busy (a spinner, no label), so nothing can go to the post by mistake.
  expect(utils.queryByText('Send')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();

  // Loaded, but it's in another circle: not answered; the reply goes to the post.
  mockDeep.isLoading = false;
  mockDeep.data = { ...mockBea, circle_id: 'c2' };
  await act(async () => {
    await utils.rerender(screen()); // a new element, so React renders again
  });
  expect(utils.queryByText(/Replying to/)).toBeNull();
  await act(async () => {
    fireEvent.press(utils.getByText('Send'));
  });
  expect(mockCreate).toHaveBeenLastCalledWith({ parentId: 'p1', body: 'Thank you', moodSlugs: [] });
});
