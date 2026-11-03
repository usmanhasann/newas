/**
 * Client revisions 10/14 p.23 (N3) on an archived circle's full list ("All prompts"): it says so at
 * the top with the same label the circle's page shows, "This circle has been archived."; the
 * prompts stay readable, and with no replies allowed there is no Reply on them.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, within } from '@testing-library/react-native';
import { CircleFeedScreen } from '@features/circles/screens/CircleFeedScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/moderation', () => ({ fetchMyCircleStanding: jest.fn(), reportContent: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }),
}));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Runners',
      type: 'public',
      owner_id: 'u1',
      archived_at: '2026-10-20T09:00:00Z',
    },
    isLoading: false,
  }),
  useMyCircles: () => ({ data: [{ id: 'c1' }] }),
}));
jest.mock('@features/circles/postMenu', () => ({ usePostMenu: () => jest.fn() }));
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: () => () => Promise.resolve(),
}));

const mockFeed = {
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isError: false,
  isFetching: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
  data: {
    pages: [
      {
        nextCursor: null,
        items: [
          {
            id: 'q1',
            circle_id: 'c1',
            author_id: 'u1',
            parent_id: null,
            body: 'What made you smile today?',
            reply_count: 3,
            like_count: 1,
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
            author: { user_id: 'u1', display_name: 'Konah', avatar_url: null },
            mention: null,
            liked_by_me: false,
          },
        ],
      },
    ],
  },
};
jest.mock('@features/circles/postsHooks', () => ({
  useCircleFeed: () => mockFeed,
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
}));

it('archived: the label at the top of the full list; prompts readable, no Reply', async () => {
  const utils = await render(
    <CircleFeedScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  const label = utils.getByTestId('circle-archived-label');
  expect(within(label).getByText('This circle has been archived.')).toBeTruthy();
  // In the fixed header with the title (it doesn't scroll away with the list).
  expect(utils.getByText('All prompts')).toBeTruthy();
  const list = utils.getByTestId('circle-feed-list');
  expect(within(list).queryByTestId('circle-archived-label')).toBeNull();
  expect(within(list).getByText('What made you smile today?')).toBeTruthy();
  expect(utils.queryByText('Reply')).toBeNull();
  expect(utils.queryByLabelText('New posts')).toBeNull();
});
