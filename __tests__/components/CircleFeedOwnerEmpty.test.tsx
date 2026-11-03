/**
 * A Public circle's creator, before their first prompt (final check 2026-10-06): the client's
 * original complaint was that the creator only saw "The creator hasn't posted a prompt yet." The
 * creator now gets the prompt composer, and the empty state speaks to them, not about them.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import { CircleFeed } from '@features/circles/components/CircleFeed';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/crisis', () => ({ useCrisisScan: () => ({ scan: jest.fn(), sheet: null }) }));
jest.mock('@features/moderation', () => ({ fetchMyCircleStanding: jest.fn(), reportContent: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: 'ok' }), // moderation standing
}));
jest.mock('@features/circles/postsHooks', () => ({
  useFeedPreview: () => ({ isLoading: false, data: { items: [], nextCursor: null } }),
  useCreatePost: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleHeart: () => ({ mutate: jest.fn() }),
  useRetryReflection: () => ({ mutate: jest.fn(), isPending: false }),
  useDeletePost: () => ({ mutate: jest.fn() }),
}));

it('the creator sees the prompt composer and an empty state written for them', async () => {
  const utils = await render(
    <CircleFeed
      circle={{ id: 'c1', name: 'Runners', type: 'public', owner_id: 'owner-1', archived_at: null } as never}
      isMember
      onOpenThread={jest.fn()}
      onSeeAll={jest.fn()}
    />,
  );
  expect(utils.getByPlaceholderText('Start a new prompt…')).toBeTruthy();
  expect(utils.getByText('Post prompt')).toBeTruthy();
  expect(utils.getByText('Write your first prompt above to start the conversation.')).toBeTruthy();
  expect(utils.queryByText('The creator hasn’t posted a prompt yet.')).toBeNull();
});
