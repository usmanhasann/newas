/**
 * Which notification switches a person gets for one circle (client spec 2026-09-29):
 * Public → replies, reactions, new prompts (members only). Private → replies, reactions, join
 * requests (owner only), new shared entries, new posts. Everything starts ON.
 */
import {
  circleNotificationSwitches,
  resolveCircleSwitches,
} from '@features/circles/notificationSwitches';

const keys = (opts: { isPublic: boolean; isOwner: boolean }) =>
  circleNotificationSwitches(opts).map((s) => s.key);

describe('circleNotificationSwitches', () => {
  it('Public member: replies, reactions, new prompts', () => {
    expect(keys({ isPublic: true, isOwner: false })).toEqual([
      'replies',
      'reactions',
      'new_prompts',
    ]);
  });

  // Client revisions 10/14 p.9: the owner's own "New members" toggle, on by default.
  it('Public creator: no "new prompts" switch (they write the prompts), and New members', () => {
    expect(keys({ isPublic: true, isOwner: true })).toEqual(['replies', 'reactions', 'new_members']);
    const newMembers = circleNotificationSwitches({ isPublic: true, isOwner: true }).find(
      (s) => s.key === 'new_members',
    )!;
    expect(newMembers.title).toBe('New members');
    expect(newMembers.desc).toBe('When someone joins this circle');
  });

  it('only the owner of a Public circle gets New members (members and Private circles never do)', () => {
    expect(keys({ isPublic: true, isOwner: false })).not.toContain('new_members');
    expect(keys({ isPublic: false, isOwner: true })).not.toContain('new_members');
    expect(keys({ isPublic: false, isOwner: false })).not.toContain('new_members');
  });

  it('Private member: replies, reactions, new shared entries, new posts — no join requests', () => {
    expect(keys({ isPublic: false, isOwner: false })).toEqual([
      'replies',
      'reactions',
      'new_entries',
      'new_posts',
    ]);
  });

  it('Private owner: also join requests', () => {
    expect(keys({ isPublic: false, isOwner: true })).toEqual([
      'replies',
      'reactions',
      'join_requests',
      'new_entries',
      'new_posts',
    ]);
  });

  it('never offers a Public-only switch in a Private circle or the reverse', () => {
    expect(keys({ isPublic: false, isOwner: true })).not.toContain('new_prompts');
    expect(keys({ isPublic: true, isOwner: true })).not.toContain('new_entries');
    expect(keys({ isPublic: true, isOwner: false })).not.toContain('join_requests');
  });

  it('uses the spec wording for replies (a prompt only exists in Public circles)', () => {
    const replies = (isPublic: boolean) =>
      circleNotificationSwitches({ isPublic, isOwner: false }).find(
        (s) => s.key === 'replies',
      )!;
    expect(replies(true).desc).toBe('When someone replies to your post or prompt');
    expect(replies(false).desc).toBe('When someone replies to your post');
  });

  it('never mentions shared entries for a Public circle (it takes none; audit 2026-09-30)', () => {
    const reactions = (isPublic: boolean) =>
      circleNotificationSwitches({ isPublic, isOwner: false }).find(
        (s) => s.key === 'reactions',
      )!;
    expect(reactions(true).desc).toBe('When someone reacts to your post or prompt');
    expect(reactions(false).desc).toBe('When someone reacts to your post or shared entry');
  });
});

describe('resolveCircleSwitches', () => {
  it('every switch is ON with no saved row', () => {
    expect(resolveCircleSwitches(null)).toEqual({
      replies: true,
      reactions: true,
      new_prompts: true,
      new_posts: true,
      new_entries: true,
      join_requests: true,
      new_members: true,
    });
  });

  it('keeps saved values and fills the rest with ON', () => {
    expect(resolveCircleSwitches({ reactions: false, new_posts: false })).toMatchObject({
      replies: true,
      reactions: false,
      new_posts: false,
      join_requests: true,
    });
  });
});
