/**
 * Circles Posts — pure permission + display logic (mirrors the can_post_in_circle RLS). Covers the
 * two interaction models (Public creator-led / Private group-chat), moderation standing + bans +
 * archived state, the discovery sort, and the reply-affordance label.
 */
import {
  circlePostPermissions,
  sortPublicCirclesByMembers,
  viewRepliesLabel,
  feedPreviewCount,
  deletePostQuestion,
  entryShareTargets,
  unshareQuestion,
  type CirclePermInput,
} from '@features/circles';

const base: CirclePermInput = {
  circleType: 'private',
  isOwner: false,
  isMember: true,
  isBanned: false,
  archived: false,
  standing: 'ok',
};

describe('circlePostPermissions — who can post', () => {
  it('Public: only the owner starts top-level posts; any member replies', () => {
    const owner = circlePostPermissions({ ...base, circleType: 'public', isOwner: true });
    expect(owner.canPostTopLevel).toBe(true);
    expect(owner.canReply).toBe(true);

    const member = circlePostPermissions({ ...base, circleType: 'public', isOwner: false });
    expect(member.canPostTopLevel).toBe(false); // not the creator
    expect(member.canReply).toBe(true);
  });

  it('Private: any member starts top-level posts and replies', () => {
    const p = circlePostPermissions({ ...base, circleType: 'private', isOwner: false });
    expect(p.canPostTopLevel).toBe(true);
    expect(p.canReply).toBe(true);
  });

  it('a non-member can do nothing', () => {
    const p = circlePostPermissions({ ...base, isMember: false });
    expect(p).toEqual({ canPostTopLevel: false, canReply: false, canReact: false });
  });

  it('a banned user can do nothing', () => {
    const p = circlePostPermissions({ ...base, circleType: 'public', isOwner: true, isBanned: true });
    expect(p).toEqual({ canPostTopLevel: false, canReply: false, canReact: false });
  });

  it('a restricted user cannot post or reply, but can still heart', () => {
    const p = circlePostPermissions({ ...base, standing: 'restricted' });
    expect(p.canPostTopLevel).toBe(false);
    expect(p.canReply).toBe(false);
    expect(p.canReact).toBe(true);
  });

  it('a suspended user can do nothing (can’t view either)', () => {
    const p = circlePostPermissions({ ...base, standing: 'suspended' });
    expect(p).toEqual({ canPostTopLevel: false, canReply: false, canReact: false });
  });

  // Client revisions 10/14 p.23: "No one can post or reply anymore" (before: replies were allowed).
  it('an archived Circle blocks new posts AND replies (Public and Private); hearts still work', () => {
    const pub = circlePostPermissions({ ...base, circleType: 'public', isOwner: true, archived: true });
    expect(pub.canPostTopLevel).toBe(false);
    expect(pub.canReply).toBe(false);
    expect(pub.canReact).toBe(true);

    const pubMember = circlePostPermissions({ ...base, circleType: 'public', archived: true });
    expect(pubMember.canReply).toBe(false);

    const priv = circlePostPermissions({ ...base, archived: true });
    expect(priv.canPostTopLevel).toBe(false);
    expect(priv.canReply).toBe(false);
    expect(priv.canReact).toBe(true);
  });

  it('unarchived again: posting and replies come back', () => {
    const priv = circlePostPermissions({ ...base, archived: false });
    expect(priv.canPostTopLevel).toBe(true);
    expect(priv.canReply).toBe(true);
    const pub = circlePostPermissions({ ...base, circleType: 'public', isOwner: true });
    expect(pub.canPostTopLevel).toBe(true);
    expect(pub.canReply).toBe(true);
  });
});

describe('sortPublicCirclesByMembers — discovery ordering', () => {
  it('orders by member count, highest first', () => {
    const sorted = sortPublicCirclesByMembers([
      { member_count: 3, name: 'B' },
      { member_count: 40, name: 'A' },
      { member_count: 12, name: 'C' },
    ]);
    expect(sorted.map((c) => c.member_count)).toEqual([40, 12, 3]);
  });

  it('tie-breaks equal counts by newer-first, and does not mutate the input', () => {
    const input = [
      { member_count: 5, created_at: '2026-01-01', name: 'Oldest' },
      { member_count: 5, created_at: '2026-05-01', name: 'Newest' },
      { member_count: 5, created_at: '2026-03-01', name: 'Middle' },
    ];
    const snapshot = [...input];
    const sorted = sortPublicCirclesByMembers(input);
    expect(sorted.map((c) => c.name)).toEqual(['Newest', 'Middle', 'Oldest']);
    expect(input).toEqual(snapshot); // pure — input untouched
  });
});

describe('viewRepliesLabel', () => {
  it('says "View [X] replies", singular for one, with a thousands separator', () => {
    expect(viewRepliesLabel(1)).toBe('View 1 reply');
    expect(viewRepliesLabel(2)).toBe('View 2 replies');
    expect(viewRepliesLabel(2847)).toBe('View 2,847 replies');
  });
});

describe('feedPreviewCount', () => {
  it('previews 5 prompts in a Public circle and 10 items in a Private one', () => {
    expect(feedPreviewCount('public')).toBe(5);
    expect(feedPreviewCount('private')).toBe(10);
  });
});

describe('deletePostQuestion', () => {
  it('names the real number of replies that go with it', () => {
    expect(deletePostQuestion('post', 2847)).toBe('Delete this post and its 2,847 replies?');
    expect(deletePostQuestion('post', 1)).toBe('Delete this post and its 1 reply?');
    expect(deletePostQuestion('reply', 3)).toBe('Delete this reply and its 3 replies?');
  });

  it('asks plainly when nothing else goes with it', () => {
    expect(deletePostQuestion('post', 0)).toBe('Delete this post?');
    expect(deletePostQuestion('reply', 0)).toBe('Delete this reply?');
  });
});

describe('entryShareTargets (audit 2026-09-30)', () => {
  const mine = [
    { id: 'fam', name: 'Family', type: 'private' as const, archived_at: null },
    { id: 'run', name: 'Runners', type: 'public' as const, archived_at: null },
    { id: 'book', name: 'Book Club', type: 'private' as const, archived_at: '2026-09-01' },
    { id: 'room', name: 'Roommates', type: 'private' as const, archived_at: '2026-09-01' },
  ];

  it('a new entry: active Private circles only (never Public, never archived)', () => {
    expect(entryShareTargets(mine, [])).toEqual([
      { id: 'fam', name: 'Family', removeOnly: null },
    ]);
  });

  it('keeps every circle it is already in, even archived or left since, as remove-only', () => {
    const shared = [
      { circleId: 'room', circleName: 'Roommates' }, // archived since
      { circleId: 'gone', circleName: 'Running Crew' }, // the writer left it
    ];
    expect(entryShareTargets(mine, shared)).toEqual([
      { id: 'fam', name: 'Family', removeOnly: null },
      { id: 'room', name: 'Roommates', removeOnly: 'archived' },
      { id: 'gone', name: 'Running Crew', removeOnly: 'left' },
    ]);
  });
});

describe('unshareQuestion (audit 2026-09-30)', () => {
  it('asks with the real reply count and every circle it leaves', () => {
    expect(
      unshareQuestion([
        { circleName: 'Family', replyTotal: 2 },
        { circleName: 'Runners', replyTotal: 0 },
        { circleName: 'Roommates', replyTotal: 1 },
      ]),
    ).toEqual({
      title: 'Stop sharing this entry?',
      message: 'It will be removed from Family, Runners and Roommates, along with 3 replies.',
    });
    expect(unshareQuestion([{ circleName: 'Family', replyTotal: 1 }])?.message).toBe(
      'It will be removed from Family, along with 1 reply.',
    );
    expect(unshareQuestion([{ circleName: 'Family', replyTotal: 2847 }])?.message).toBe(
      'It will be removed from Family, along with 2,847 replies.',
    );
  });

  it('asks nothing when no replies would be lost (it can simply be shared again)', () => {
    expect(unshareQuestion([])).toBeNull();
    expect(unshareQuestion([{ circleName: 'Family', replyTotal: 0 }])).toBeNull();
  });
});
