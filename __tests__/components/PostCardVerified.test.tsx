/**
 * Verified badges in circles (client revisions 10/14 p.5, N7.10 to N7.13): a verified person's
 * posts, prompts and replies show the purple badge right after their name, and so does the "@"
 * line of a reply answering them. Someone who isn't verified gets no badge.
 * One render per file (React 19 concurrent renders leak across sibling tests): both cards render
 * together.
 */
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
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
  author: null,
  mention: null,
  liked_by_me: false,
};

const noop = () => {};

it('puts the badge right after a verified name (author and "@"), and nowhere else', async () => {
  const utils = await render(
    <View>
      {/* A verified person's reply, answering another verified person. */}
      <PostCard
        post={{
          ...base,
          id: 'r1',
          parent_id: 'p0',
          body: 'See you there',
          author: { user_id: 'u1', display_name: 'Taylor Star', avatar_url: null, verified: true },
          mention_user_id: 'u2',
          mention: { user_id: 'u2', display_name: 'Sam Star', avatar_url: null, verified: true },
        }}
        depth={1}
        canReply
        canReact
        onHeart={noop}
        onReply={noop}
        onMenu={noop}
      />
      {/* An ordinary person's post answering an ordinary person. */}
      <PostCard
        post={{
          ...base,
          id: 'r2',
          parent_id: 'p0',
          body: 'Me too',
          author: { user_id: 'u3', display_name: 'Ben', avatar_url: null, verified: false },
          mention_user_id: 'u4',
          mention: { user_id: 'u4', display_name: 'Ada', avatar_url: null },
        }}
        canReply
        canReact
        onHeart={noop}
        onReply={noop}
        onMenu={noop}
      />
    </View>,
  );

  // Two badges in all: the verified author and the verified "@".
  const badges = utils.getAllByLabelText('Verified');
  expect(badges).toHaveLength(2);

  // Author: the badge is the very next thing after the name, in the same row.
  const authorName = utils.getByText('Taylor Star');
  const row = authorName.parent!;
  expect(row.children).toHaveLength(2);
  expect(row.children[0]).toBe(authorName);
  expect(row.children[1]).toBe(badges[0]);
  // A long name shortens; the badge stays visible after it.
  expect(String(authorName.props.className).split(' ')).toContain('shrink');
  expect(authorName.props.numberOfLines).toBe(1);

  // "@": the badge sits inside the "@Sam Star" line, right after the name.
  const mention = utils.getByText('@Sam Star');
  expect(mention.children).toContain(badges[1]);

  // The ordinary people: names shown, no badge with them.
  const benRow = utils.getByText('Ben').parent!;
  expect(benRow.children).toHaveLength(1);
  expect(utils.getByText('@Ada').children.some((c) => typeof c !== 'string')).toBe(false);
});
