/**
 * Client revisions 10/14 p.23 (N3) in the feed on an archived Public circle's page: no one can post
 * or reply, so there is no post box and no "You can reply to any of them" hint (it would be wrong),
 * and no Reply on the prompts. The page's header already shows "This circle has been archived."
 * right above (CircleDetailArchivedLabel.test), so the feed doesn't repeat it, and the older,
 * differently worded caption is gone. One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import { CircleFeed } from '@features/circles/components/CircleFeed';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'member-1' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({ fetchMyCircleStanding: jest.fn(), reportContent: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }),
}));
jest.mock('@features/circles/postMenu', () => ({ usePostMenu: () => jest.fn() }));
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: () => () => Promise.resolve(),
}));

const mockPreview = {
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
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
jest.mock('@features/circles/postsHooks', () => ({
  useFeedPreview: () => mockPreview,
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useCreatePost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
}));

it('archived Public circle: prompts readable; no post box, no reply hint, no Reply, no repeat label', async () => {
  const utils = await render(
    <CircleFeed
      circle={
        {
          id: 'c1',
          name: 'Runners',
          type: 'public',
          owner_id: 'owner-1',
          archived_at: '2026-10-20T09:00:00Z',
        } as never
      }
      isMember
      onOpenThread={jest.fn()}
      onSeeAll={jest.fn()}
    />,
  );

  expect(utils.getByText('What made you smile today?')).toBeTruthy();
  expect(utils.queryByPlaceholderText('Start a new prompt…')).toBeNull();
  expect(utils.queryByText('Reply')).toBeNull();
  expect(
    utils.queryByText('Only the creator starts prompts here. You can reply to any of them.'),
  ).toBeNull();
  expect(utils.queryByText('This circle is archived, so no new posts can be added.')).toBeNull();
  expect(utils.queryByTestId('circle-archived-label')).toBeNull(); // shown once, in the page header
});
