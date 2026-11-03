/**
 * "Seen by" read receipts were removed completely (client request): nobody sees who viewed a
 * shared entry, and opening one records nothing and notifies nobody (the owner used to get a push
 * on EVERY view). Shared entries now open as posts in their circle; the thread screen runs for
 * real here with its data hooks faked, so re-adding a view receipt fails this test.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import type { NotifyEvent } from '@features/notifications';
import { PostThreadScreen } from '@features/circles/screens/PostThreadScreen';

const mockNotifyEvent = jest.fn();
jest.mock('@features/notifications', () => ({
  notifyEvent: (e: unknown) => mockNotifyEvent(e),
}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({
  fetchMyCircleStanding: () => Promise.resolve('ok'),
  reportContent: jest.fn(),
}));
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
jest.mock('@features/circles/postsHooks', () => ({
  usePost: () => ({
    isLoading: false,
    data: {
      id: 'p1',
      circle_id: 'c1',
      author_id: 'u1',
      parent_id: null,
      body: 'I slowed down today.',
      reply_count: 0,
      like_count: 0,
      created_at: '2026-09-28T09:00:00Z',
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
      entry_id: 'e1',
      entry_version: 'reflection',
      mood_slugs: ['calm'],
      reply_to_id: null,
      mention_user_id: null,
      thread_created_at: '2026-09-28T09:00:00Z',
      author: { user_id: 'u1', display_name: 'Najam', avatar_url: null },
      mention: null,
      liked_by_me: false,
    },
  }),
  useReplies: () => ({
    isLoading: false,
    data: { pages: [{ items: [], nextCursor: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    isFetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  replyItems: (q: { data?: { pages: { items: unknown[] }[] } }) =>
    q.data?.pages.flatMap((p) => p.items) ?? [],
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useCreatePost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
  useDeletePost: () => ({ mutate: jest.fn() }),
}));

// Compile-time guard (tests are type-checked): 'view' must never be a notifiable event again.
// @ts-expect-error — the Seen-by 'view' event was removed.
const retired: NotifyEvent = { type: 'view', entry_id: 'e1' };
void retired;

it('opening a shared entry shows it, records no view and sends no notification', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const { getByText, queryByText } = await render(
    <PostThreadScreen
      navigation={nav as never}
      route={{ params: { circleId: 'c1', postId: 'p1' } } as never}
    />,
  );
  expect(getByText('Najam')).toBeTruthy(); // fully rendered
  expect(getByText('I slowed down today.')).toBeTruthy();
  expect(queryByText('Seen by')).toBeNull();
  expect(mockNotifyEvent).not.toHaveBeenCalled();
});
