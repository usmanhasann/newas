/**
 * PostCard: one message in a circle (client spec 2026-09-29). A shared entry looks like any post;
 * showing the AI reflection adds a small ✨ by the time. Moods show as pills, a reply inside a
 * group starts with "@Name", replies collapse under "View N replies", and a reflection that isn't
 * ready yet (only its author sees it) can't be hearted or replied to.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { PostCard } from '@features/circles';
import type { PostWithAuthor } from '@features/circles';

const base: PostWithAuthor = {
  id: 'p1',
  circle_id: 'c1',
  author_id: 'u1',
  parent_id: null,
  body: 'Hello circle',
  reply_count: 0,
  like_count: 0,
  created_at: '2026-09-14T12:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null,
  entry_id: null,
  entry_version: null,
  mood_slugs: [],
  reply_to_id: null,
  mention_user_id: null,
  thread_created_at: '2026-09-14T12:00:00.000Z',
  author: { user_id: 'u1', display_name: 'Ada', avatar_url: null },
  mention: null,
  liked_by_me: false,
};

const noop = () => {};
function renderCard(post: Partial<PostWithAuthor> = {}, props: Record<string, unknown> = {}) {
  return render(
    <PostCard
      post={{ ...base, ...post }}
      canReply
      canReact
      onHeart={noop}
      onReply={noop}
      onMenu={noop}
      {...props}
    />,
  );
}

describe('<PostCard />', () => {
  it('shows the author and body, with no ✨ on a plain post', async () => {
    const utils = await renderCard();
    expect(utils.getByText('Ada')).toBeTruthy();
    expect(utils.getByText('Hello circle')).toBeTruthy();
    expect(utils.queryByLabelText('Shared as an AI reflection')).toBeNull();
  });

  it('marks a shared AI reflection with ✨, and shows its moods', async () => {
    const utils = await renderCard({
      entry_id: 'e1',
      entry_version: 'reflection',
      body: 'I felt calm — and grateful.',
      mood_slugs: ['calm', 'grateful'],
    });
    expect(utils.getByLabelText('Shared as an AI reflection')).toBeTruthy();
    expect(utils.getByLabelText('Mood: Calm')).toBeTruthy();
    expect(utils.getByLabelText('Mood: Grateful')).toBeTruthy();
    expect(utils.getByText('I felt calm, and grateful.')).toBeTruthy(); // AI text shown without dashes
  });

  it('an entry shared as written looks like any post (no ✨), words untouched', async () => {
    const utils = await renderCard({
      entry_id: 'e1',
      entry_version: 'written',
      body: 'Matcha with Augie - so good',
      mood_slugs: ['happy'],
    });
    expect(utils.queryByLabelText('Shared as an AI reflection')).toBeNull();
    expect(utils.getByText('Matcha with Augie - so good')).toBeTruthy();
  });

  it('starts a reply inside a group with the "@" person it answers', async () => {
    const utils = await renderCard({
      parent_id: 'p0',
      body: 'See you at 5!',
      mention_user_id: 'u2',
      mention: { user_id: 'u2', display_name: 'Konah', avatar_url: null },
    });
    expect(utils.getByText('@Konah')).toBeTruthy();
  });

  it('collapses replies under "View N replies" when it heads a group', async () => {
    const onToggle = jest.fn();
    const utils = await renderCard({ reply_count: 3 }, { onToggleReplies: onToggle });
    fireEvent.press(utils.getByText('View 3 replies'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('offers no "View replies" where it is not a group head', async () => {
    const utils = await renderCard({ reply_count: 3 });
    expect(utils.queryByText(/View .* repl/)).toBeNull();
    expect(utils.getByText('Reply')).toBeTruthy();
  });

  it('a reflection still on its way: its author sees a note, and it can’t be hearted or replied to', async () => {
    const onHeart = jest.fn();
    const utils = await renderCard({ entry_id: 'e1', entry_version: 'reflection', body: null }, { onHeart });
    expect(utils.getByText(/Your AI reflection is on its way/)).toBeTruthy();
    expect(utils.queryByText('Reply')).toBeNull();
    fireEvent.press(utils.getByLabelText('Like'));
    expect(onHeart).not.toHaveBeenCalled();
  });

  it('reflects the viewer’s heart state and fires onHeart', async () => {
    const onHeart = jest.fn();
    const utils = await renderCard({ liked_by_me: true, like_count: 2 }, { onHeart });
    expect(utils.getByLabelText('Unlike')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Unlike'));
    expect(onHeart).toHaveBeenCalled();
  });
});
