/**
 * Client 10/14 p.7 (N1) on a PRIVATE circle post's page: two people talking shouldn't have to
 * leave and come back. Auguste's reply appears on its own (only this thread's replies reload),
 * hearts and the post's edit update live, a deleted reply goes, the channel closes in the
 * background and coming back loads anything new right away. A post deleted while open says so and
 * keeps the way back. Real React Query cache; the Realtime channel and the database are mocked.
 * One render per file (React 19 leaks across sibling renders).
 */
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, act, waitFor } from '@testing-library/react-native';
import { queryClient } from '@lib';
import { PostThreadScreen } from '@features/circles/screens/PostThreadScreen';
import type { LivePostSignal, LiveStatus } from '@features/circles/liveApi';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({
  fetchMyCircleStanding: () => Promise.resolve('ok'),
  reportContent: jest.fn(),
  moderateCircleText: jest.fn(),
  scanCirclePost: jest.fn(),
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
const mockChannels: { circleId: string; handlers: Handlers; stop: jest.Mock }[] = [];
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: (circleId: string, handlers: Handlers) => {
    const stop = jest.fn(() => Promise.resolve());
    mockChannels.push({ circleId, handlers, stop });
    return stop;
  },
}));

const mockId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = mockId(1);
const R1 = mockId(11);
const R2 = mockId(12);
const R3 = mockId(13);
const mockItem = (id: string, minute: number, body: string, over: Record<string, unknown> = {}) => ({
  id,
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
  thread_created_at: '2026-10-20T10:01:00+00:00',
  author: { user_id: 'u3', display_name: 'Auguste', avatar_url: null },
  mention: null,
  liked_by_me: false,
  ...over,
});
const mockDb = {
  root: mockItem(P1, 1, 'Walk at 5?', { author_id: 'u2', reply_count: 1 }) as Record<string, unknown> | null,
  replies: [mockItem(R1, 2, 'Yes!', { parent_id: P1 })],
};
const mockFetchReplies = jest.fn((..._a: unknown[]) =>
  Promise.resolve({ items: mockDb.replies, nextCursor: null }),
);
jest.mock('@features/circles/postsApi', () => ({
  ...jest.requireActual('@features/circles/postsApi'),
  fetchPost: (id: string) => Promise.resolve(id === mockId(1) ? mockDb.root : null),
  fetchReplies: (...a: unknown[]) => mockFetchReplies(...a),
}));

const signal = (over: Partial<LivePostSignal>): LivePostSignal => ({
  op: 'insert',
  post_id: R2,
  parent_id: P1,
  like_count: 0,
  reply_count: 0,
  edited: false,
  ...over,
});

it('replies, hearts, edits and deletions show up live; background closes; coming back catches up', async () => {
  const appListeners: ((s: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, fn) => {
    appListeners.push(fn as (s: AppStateStatus) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  const goBack = jest.fn();
  const utils = await render(
    <QueryClientProvider client={queryClient}>
      <PostThreadScreen
        navigation={{ navigate: jest.fn(), goBack } as never}
        route={{ params: { circleId: 'c1', postId: P1 } } as never}
      />
    </QueryClientProvider>,
  );
  await utils.findByText('Yes!');
  await waitFor(() => expect(mockChannels).toHaveLength(1));
  const { onSignal } = mockChannels[0]!.handlers;

  // Auguste replies: it appears without leaving the page.
  mockDb.replies = [...mockDb.replies, mockItem(R2, 3, 'Count me in', { parent_id: P1 })];
  await act(async () => {
    onSignal(signal({ post_id: R2, parent_id: P1 }));
    onSignal(signal({ op: 'update', post_id: P1, parent_id: null, reply_count: 2 }));
  });
  await utils.findByText('Count me in');
  expect(mockFetchReplies).toHaveBeenLastCalledWith(P1, 'u2', null);

  // A heart on the post, then the post's text edited: both live.
  mockDb.root = { ...mockDb.root!, body: 'Walk at 6?', like_count: 2, reply_count: 2 };
  await act(async () => {
    onSignal(signal({ op: 'update', post_id: P1, parent_id: null, like_count: 2, reply_count: 2 }));
  });
  await utils.findByText('2');
  await act(async () => {
    onSignal(signal({ op: 'update', post_id: P1, parent_id: null, like_count: 2, reply_count: 2, edited: true }));
  });
  await utils.findByText('Walk at 6?');

  // A deleted reply goes.
  await act(async () => onSignal(signal({ op: 'delete', post_id: R1, parent_id: P1 })));
  await waitFor(() => expect(utils.queryByText('Yes!')).toBeNull());
  mockDb.replies = mockDb.replies.filter((r) => r.id !== R1);

  // To the background: the channel closes. Back: it reopens and loads what came in meanwhile.
  await act(async () => appListeners.forEach((fn) => fn('background')));
  await waitFor(() => expect(mockChannels[0]!.stop).toHaveBeenCalled());
  mockDb.replies = [...mockDb.replies, mockItem(R3, 4, 'On my way', { parent_id: P1 })];
  await act(async () => appListeners.forEach((fn) => fn('active')));
  await utils.findByText('On my way');
  await waitFor(() => expect(mockChannels).toHaveLength(2));

  // The post itself is deleted while open: it says so, with the way back.
  await act(async () => mockChannels[1]!.handlers.onSignal(signal({ op: 'delete', post_id: P1, parent_id: null })));
  await utils.findByText('This post isn’t available.');
  expect(utils.getByLabelText('Go back')).toBeTruthy();
});
