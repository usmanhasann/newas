/**
 * Client 10/14 p.7 (N1) on a PUBLIC circle's page (the 5 newest prompts):
 *  - opening the circle loads anything new right away, even when its prompts were loaded moments
 *    ago (they'd otherwise be reused as they were);
 *  - a new prompt from the creator appears on its own; hearts update live;
 *  - while the page says the person is scrolled down, a new prompt waits (the page is told how many,
 *    for its "New posts" button) and comes in once they're back at the top.
 * Real React Query cache; the Realtime channel and the database are mocked.
 * One render per file (React 19 leaks across sibling renders).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, act, waitFor } from '@testing-library/react-native';
import { queryClient } from '@lib';
import { CircleFeed } from '@features/circles/components/CircleFeed';
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
const mockPrompt = (n: number, minute: number, body: string, over: Record<string, unknown> = {}) => ({
  id: mockId(n),
  circle_id: 'c1',
  author_id: 'owner',
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
  author: { user_id: 'owner', display_name: 'Konah', avatar_url: null },
  mention: null,
  liked_by_me: false,
  ...over,
});
const mockFetchFeedPage = jest.fn((..._a: unknown[]) =>
  Promise.resolve({
    items: [mockPrompt(2, 2, 'Posted while away'), mockPrompt(1, 1, 'What made you smile?')],
    nextCursor: null,
  }),
);
const mockFetchPost = jest.fn((postId: string) =>
  Promise.resolve(
    postId === mockId(3)
      ? mockPrompt(3, 3, 'Name one small win')
      : postId === mockId(4)
        ? mockPrompt(4, 4, 'Who do you miss?')
        : null,
  ),
);
jest.mock('@features/circles/postsApi', () => ({
  ...jest.requireActual('@features/circles/postsApi'),
  fetchFeedPage: (...a: unknown[]) => mockFetchFeedPage(...a),
  fetchPost: (id: string) => mockFetchPost(id),
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
const circle = { id: 'c1', name: 'Gratitude', type: 'public', owner_id: 'owner', archived_at: null } as never;

it('loads what’s new on open, shows new prompts live, and holds them while scrolled down', async () => {
  // Opened moments ago: the prompts are cached and "fresh", so without catching up they'd be reused.
  queryClient.setQueryData(['circlePosts', 'feed', 'c1', 'preview', 5, 'owner'], {
    items: [mockPrompt(1, 1, 'What made you smile?')],
    nextCursor: null,
  });
  const onWaiting = jest.fn();
  const ui = (hold: boolean) => (
    <QueryClientProvider client={queryClient}>
      <CircleFeed
        circle={circle}
        isMember
        onOpenThread={jest.fn()}
        onSeeAll={jest.fn()}
        holdNewPosts={hold}
        onNewPostsWaiting={onWaiting}
      />
    </QueryClientProvider>
  );
  const utils = await render(ui(false));
  // Opening the circle loaded anything new right away.
  await utils.findByText('Posted while away');
  expect(mockFetchFeedPage).toHaveBeenCalledWith('c1', 'u2', { creatorOnly: 'owner', limit: 5 });
  await waitFor(() => expect(mockChannels).toHaveLength(1));
  const { onSignal } = mockChannels[0]!.handlers;

  // A new prompt from the creator appears on its own; a heart updates live.
  await act(async () => onSignal(signal({ post_id: mockId(3) })));
  await utils.findByText('Name one small win');
  await act(async () => onSignal(signal({ op: 'update', post_id: mockId(1), like_count: 2 })));
  await utils.findByText('2');

  // Scrolled down: the next prompt waits, and the page hears one is waiting.
  await utils.rerender(ui(true));
  await act(async () => onSignal(signal({ post_id: mockId(4) })));
  await waitFor(() => expect(onWaiting).toHaveBeenLastCalledWith(1));
  expect(utils.queryByText('Who do you miss?')).toBeNull();
  expect(utils.getByText('What made you smile?')).toBeTruthy();

  // Back at the top: it comes in.
  await utils.rerender(ui(false));
  expect(utils.getByText('Who do you miss?')).toBeTruthy();
  await waitFor(() => expect(onWaiting).toHaveBeenLastCalledWith(0));
});
