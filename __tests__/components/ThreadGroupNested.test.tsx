/**
 * Client 10/14 p.6, the Private circle feed: under a post, each reply is its own group with its
 * replies under "View N replies" (a reply to Augie's reply shows under Augie's reply, as in Public),
 * and Reply on any of them answers it on the POST's page (rootId), never on a reply's own page.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThreadGroup, type PostActions } from '@features/circles/components/ThreadGroup';
import type { PostWithAuthor } from '@features/circles/postsApi';

const mockItem = (over: Record<string, unknown>) =>
  ({
    circle_id: 'c1',
    reply_count: 0,
    like_count: 0,
    created_at: '2026-09-29T09:00:00Z',
    deleted_at: null,
    entry_id: null,
    entry_version: null,
    mood_slugs: [],
    reply_to_id: null,
    mention_user_id: null,
    mention: null,
    liked_by_me: false,
    ...over,
  }) as unknown as PostWithAuthor;
const mockAugie = mockItem({
  id: 'r1',
  parent_id: 'p1',
  author_id: 'u3',
  body: 'I’m here for you',
  reply_count: 1,
  author: { user_id: 'u3', display_name: 'Augie', avatar_url: null },
});
const mockBea = mockItem({
  id: 'r9',
  parent_id: 'r1',
  author_id: 'u4',
  body: 'Same here',
  author: { user_id: 'u4', display_name: 'Bea', avatar_url: null },
});
jest.mock('@features/circles/postsHooks', () => ({
  useReplies: (parentId: string) => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    isFetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    data: {
      pages: [{ nextCursor: null, items: parentId === 'p1' ? [mockAugie] : parentId === 'r1' ? [mockBea] : [] }],
    },
  }),
  replyItems: (q: { data?: { pages: { items: unknown[] }[] } }) =>
    q.data?.pages.flatMap((p) => p.items) ?? [],
}));

const post = mockItem({
  id: 'p1',
  parent_id: null,
  author_id: 'u2',
  body: 'Rough week',
  reply_count: 2,
  author: { user_id: 'u2', display_name: 'Konah', avatar_url: null },
});
const actions: PostActions = {
  perms: { canReply: true, canReact: true } as PostActions['perms'],
  onHeart: jest.fn(),
  onReply: jest.fn(),
  onMenu: jest.fn(),
};

it('shows a reply’s replies under it and answers them on the post’s page', async () => {
  const utils = await render(<ThreadGroup post={post} actions={actions} initiallyOpen />);
  expect(utils.getByText('I’m here for you')).toBeTruthy();
  // Augie's reply heads its own group; Bea's answer to it is under it, not loose under the post.
  expect(utils.queryByText('Same here')).toBeNull();
  await act(async () => {
    fireEvent.press(utils.getByText('View 1 reply'));
  });
  expect(utils.getByText('Same here')).toBeTruthy();

  // Reply on Bea's reply → the post's page (rootId p1), aimed at Bea's reply.
  const replies = utils.getAllByText('Reply');
  await act(async () => {
    fireEvent.press(replies[replies.length - 1]!);
  });
  expect(actions.onReply).toHaveBeenLastCalledWith(mockBea, 'p1');
  // Reply on Augie's reply → also on the post's page.
  await act(async () => {
    fireEvent.press(replies[1]!);
  });
  expect(actions.onReply).toHaveBeenLastCalledWith(mockAugie, 'p1');
});
