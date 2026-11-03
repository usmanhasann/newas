/**
 * A PUBLIC circle's feed (client spec 2026-09-29): the creator's 5 newest prompts, each opening its
 * own page to read and reply; members see why they can't start one; the arrow opens every prompt.
 * No entries here (Public circles are prompts and replies).
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { CircleFeed } from '@features/circles/components/CircleFeed';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'member-1' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({ fetchMyCircleStanding: jest.fn(), reportContent: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }),
}));

const mockPreview = jest.fn();
jest.mock('@features/circles/postsHooks', () => ({
  useFeedPreview: (...args: unknown[]) => {
    mockPreview(...args);
    return {
      isLoading: false,
      data: {
        items: [
          {
            id: 'q1',
            circle_id: 'c1',
            author_id: 'owner-1',
            parent_id: null,
            body: 'What made you smile today?',
            reply_count: 12,
            like_count: 4,
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
            author: { user_id: 'owner-1', display_name: 'Konah', avatar_url: null },
            mention: null,
            liked_by_me: false,
          },
        ],
        nextCursor: null,
      },
    };
  },
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

it('previews the creator’s 5 newest prompts; a member replies on the prompt’s page', async () => {
  const onOpenThread = jest.fn();
  const onSeeAll = jest.fn();
  const utils = await render(
    <CircleFeed
      circle={{ id: 'c1', name: 'Runners', type: 'public', owner_id: 'owner-1', archived_at: null } as never}
      isMember
      onOpenThread={onOpenThread}
      onSeeAll={onSeeAll}
    />,
  );

  expect(mockPreview).toHaveBeenCalledWith('c1', 5, 'owner-1'); // the creator's prompts only
  expect(utils.getByText('Prompts')).toBeTruthy();
  expect(utils.getByText('What made you smile today?')).toBeTruthy();
  expect(utils.getByText('Only the creator starts prompts here. You can reply to any of them.')).toBeTruthy();
  expect(utils.queryByPlaceholderText('Start a new prompt…')).toBeNull();
  expect(utils.queryByText(/View .* replies/)).toBeNull(); // a prompt's replies live on its page

  fireEvent.press(utils.getByText('What made you smile today?'));
  expect(onOpenThread).toHaveBeenCalledWith('q1');
  fireEvent.press(utils.getByText('Reply'));
  expect(onOpenThread).toHaveBeenCalledTimes(2);
  fireEvent.press(utils.getByLabelText('See all prompts'));
  expect(onSeeAll).toHaveBeenCalledTimes(1);
});
