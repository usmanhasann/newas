/**
 * The writer's own reflection share whose AI reflection never arrived (audit 2026-09-30): it used to
 * say "on its way" forever. It now offers "Try again", which asks for the reflection once more.
 * Only a pending reflection share shows it.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { PostCard } from '@features/circles/components/PostCard';

const base = {
  id: 'p1',
  circle_id: 'c1',
  parent_id: null,
  author_id: 'u1',
  reply_count: 0,
  like_count: 0,
  created_at: '2026-09-29T09:00:00Z',
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: 'e1',
  entry_version: 'reflection' as const,
  mood_slugs: ['calm'],
  reply_to_id: null,
  mention_user_id: null,
  thread_created_at: '2026-09-29T09:00:00Z',
  author: { user_id: 'u1', display_name: 'Konah', avatar_url: null },
  mention: null,
  liked_by_me: false,
};

it('offers "Try again" on a pending reflection share, and only there', async () => {
  const retry = jest.fn();
  const noop = () => {};
  const utils = await render(
    <>
      <PostCard post={{ ...base, body: null }} canReply canReact onHeart={noop} onReply={noop} onMenu={noop} onRetryReflection={retry} />
      <PostCard post={{ ...base, id: 'p2', body: 'I slowed down today.' }} canReply canReact onHeart={noop} onReply={noop} onMenu={noop} onRetryReflection={retry} />
    </>,
  );
  expect(utils.getByText('Your AI reflection is on its way. Your circle will see it once it’s ready.')).toBeTruthy();
  expect(utils.getAllByText('Taking a while? Try again')).toHaveLength(1); // not on the ready one
  fireEvent.press(utils.getByText('Taking a while? Try again'));
  expect(retry).toHaveBeenCalledTimes(1);
});
